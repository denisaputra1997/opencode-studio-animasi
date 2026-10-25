import asyncio
import os
import random
import re
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.masteragent import make_plan, plan_to_events, write_animation_spec, write_asset
from app.agent_scan import ScanError, scan_project as scan_agent_project
from app.subagents import (
    available_divisions,
    ensure_default_subagents,
    ensure_plan_subagents,
    ensure_subagent,
    list_subagents,
    subagent_persona,
)
from app.events import ActivityStore, log_path_from_env, normalize, parse_log_line, tail_log
from app.workspace import (
    ANIMATION_FILENAME,
    OUTPUT_ROOT,
    REPO_ROOT,
    asset_filename,
    build_asset_text,
    fallback_animation_html,
    list_projects,
    make_project_dir,
    read_project_files,
    relative_to_output,
    render_animation_html,
)

SIM_STATES = ["THINKING", "WORKING", "WORKING", "DONE", "BLOCKED", "IDLE"]

MEETING_SECONDS = float(os.getenv("STUDIO_MEETING_SECONDS", "3.0"))

connected: set[WebSocket] = set()


async def broadcast(event: dict) -> None:
    for ws in list(connected):
        try:
            await ws.send_json(event)
        except Exception:
            connected.discard(ws)


def meeting_message(phase: str, agent_id: str, task: str, meeting_id: str) -> dict:
    """Event khusus: masteragent memberi tugas ke sub-agent di ruang meeting."""
    return {
        "type": "meeting",
        "phase": phase,
        "meeting_id": meeting_id,
        "participants": ["masteragent", agent_id],
        "agent_id": agent_id,
        "task": task,
    }


store = ActivityStore(broadcast)

project_tasks: set[asyncio.Task] = set()


def spawn(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    project_tasks.add(task)
    task.add_done_callback(project_tasks.discard)
    return task


async def handoff_meeting(event: dict) -> None:
    """Masteragent memanggil sub-agent ke ruang meeting untuk menyerahkan tugas."""
    agent_id = event["agent_id"]
    role = event.get("role") or agent_id
    task = event.get("task_description") or ""
    meeting_id = uuid.uuid4().hex

    await broadcast(meeting_message("start", agent_id, task, meeting_id))
    await store.publish(
        normalize(
            {
                "agent_id": "masteragent",
                "role": "masteragent",
                "state": "MEETING",
                "task_description": f"Briefing {role}: {task}",
            },
            "prompt",
        )
    )
    await store.publish(
        normalize(
            {
                "agent_id": agent_id,
                "role": role,
                "state": "MEETING",
                "task_description": f"Menerima tugas: {task}",
            },
            "prompt",
        )
    )
    await asyncio.sleep(MEETING_SECONDS)
    await broadcast(meeting_message("end", agent_id, task, meeting_id))
    await store.publish(
        normalize(
            {
                "agent_id": "masteragent",
                "role": "masteragent",
                "state": "IDLE",
                "task_description": "Kembali ke meja",
            },
            "prompt",
        )
    )


async def run_subtask(event: dict, prompt: str, project_dir, index: int) -> None:
    """Kerjakan satu sub-tugas: buat folder/file deliverable, lalu tandai DONE."""
    agent_id = event["agent_id"]
    role = event.get("role") or agent_id
    task = event.get("task_description") or ""
    base = {"agent_id": agent_id, "role": role, "task_description": task}

    await store.publish(
        {**base, "state": "WORKING", "progress": None, "task_description": f"{task} → menyiapkan berkas…"},
        "prompt",
    )
    try:
        ensure_subagent(agent_id, role, task)
        body = await write_asset(role, task, prompt, persona=subagent_persona(agent_id))
    except Exception as exc:
        body = f"Draft otomatis (LLM tidak tersedia: {exc}).\n\n- {task}"

    path = project_dir / asset_filename(agent_id, index)
    path.write_text(build_asset_text(role, agent_id, task, prompt, body), encoding="utf-8")
    rel = relative_to_output(path)

    await store.publish(
        {**base, "state": "DONE", "progress": 1.0, "task_description": f"{task} → {rel}"},
        "prompt",
    )


async def run_pipeline(prompt: str, project_dir, events: list[dict]) -> None:
    """Alur produksi: meeting per tugas → tiap divisi berkarya → wujudkan animasi."""
    for index, event in enumerate(events, start=1):
        await handoff_meeting(event)
        await run_subtask(event, prompt, project_dir, index)
    await run_project(prompt, project_dir)


async def run_project(prompt: str, project_dir) -> None:
    """Setelah semua rancangan divisi selesai, wujudkan file animasinya."""
    files = read_project_files(project_dir)

    await store.publish(
        normalize(
            {
                "agent_id": "compositor",
                "role": "Compositor",
                "state": "WORKING",
                "task_description": "Mewujudkan animasi dari rancangan tiap divisi…",
            },
            "prompt",
        )
    )
    try:
        spec = await write_animation_spec(prompt, files)
        html = render_animation_html(prompt, spec)
        note = ""
    except Exception as exc:
        html = fallback_animation_html(prompt, files)
        note = f" (mode cadangan: {exc})"

    path = project_dir / ANIMATION_FILENAME
    path.write_text(html, encoding="utf-8")
    rel = relative_to_output(path)

    await store.publish(
        normalize(
            {
                "agent_id": "compositor",
                "role": "Compositor",
                "state": "DONE",
                "task_description": f"Animasi siap → {rel}{note}",
            },
            "prompt",
        )
    )
    await store.publish(
        normalize(
            {
                "agent_id": "masteragent",
                "role": "masteragent",
                "state": "DONE",
                "task_description": f"Proyek selesai → {rel}",
            },
            "prompt",
        )
    )


async def event_producer() -> None:
    """Simulator opsional (SIMULATE_EVENTS=1) untuk uji canvas tanpa sumber asli."""
    while True:
        divisions = available_divisions()
        agents = [{"agent_id": "masteragent", "role": "masteragent"}] + [
            {"agent_id": item["id"], "role": item["role"]} for item in divisions
        ]
        tasks = [item["description"] for item in divisions] or ["Mengoordinasi sub-agent"]
        agent = random.choice(agents)
        state = random.choice(SIM_STATES)
        progress = random.choice([None, None, round(random.random(), 2)]) if state == "WORKING" else None
        await store.publish(
            normalize(
                {
                    "agent_id": agent["agent_id"],
                    "role": agent["role"],
                    "state": state,
                    "task_description": random.choice(tasks),
                    "progress": progress,
                },
                "sim",
            )
        )
        await asyncio.sleep(3)


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_default_subagents()
    tasks = []
    if os.getenv("SIMULATE_EVENTS", "0") == "1":
        tasks.append(asyncio.create_task(event_producer()))
    log_path = log_path_from_env()
    if log_path:
        tasks.append(
            asyncio.create_task(
                tail_log(log_path, store, poll=float(os.getenv("ACTIVITY_LOG_POLL", "1.0")))
            )
        )
    yield
    for task in tasks:
        task.cancel()
    for task in list(project_tasks):
        task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/output", StaticFiles(directory=str(OUTPUT_ROOT)), name="output")


class ProjectRequest(BaseModel):
    prompt: str


class EventRequest(BaseModel):
    agent_id: str
    state: str = "WORKING"
    role: str | None = None
    task_description: str | None = None
    progress: float | None = None


class LogRequest(BaseModel):
    line: str | None = None
    lines: list[str] | None = None


class ScanRequest(BaseModel):
    project_path: str | None = None
    projectPath: str | None = None


@app.post("/project")
async def submit_project(req: ProjectRequest) -> dict:
    await store.publish(
        normalize(
            {
                "agent_id": "masteragent",
                "role": "masteragent",
                "state": "THINKING",
                "task_description": f"Menyusun rencana: {req.prompt}",
            },
            "prompt",
        )
    )
    try:
        plan = await make_plan(req.prompt)
    except Exception as exc:
        await store.publish(
            normalize(
                {
                    "agent_id": "masteragent",
                    "state": "BLOCKED",
                    "task_description": f"Gagal menyusun rencana: {exc}",
                },
                "prompt",
            )
        )
        raise HTTPException(status_code=502, detail=f"Gagal memanggil LLM: {exc}") from exc

    try:
        created_subagents = ensure_plan_subagents(plan.subtasks)
    except Exception:
        created_subagents = []
    events = plan_to_events(plan)
    project_dir, project_slug = make_project_dir(req.prompt)
    sent = await store.publish_many(events, source="prompt")
    await store.publish(
        normalize(
            {
                "agent_id": "masteragent",
                "role": "masteragent",
                "state": "DONE",
                "task_description": f"Rencana siap: {len(events)} sub-tugas → output/{project_slug}/",
            },
            "prompt",
        )
    )
    if sent:
        spawn(run_pipeline(req.prompt, project_dir, sent))
    return {
        "subtasks": sent,
        "project": relative_to_output(project_dir),
        "subagents": [os.path.relpath(path, REPO_ROOT) for path in created_subagents],
    }


@app.get("/projects")
async def get_projects() -> dict:
    """Daftar proyek di folder output beserta status file & animasinya."""
    return {"projects": list_projects()}


@app.get("/projects/folders")
async def get_project_folders() -> dict:
    """Daftar folder proyek yang tersedia untuk dipilih."""
    if not OUTPUT_ROOT.exists():
        return {"folders": []}
    folders = []
    for folder in sorted(OUTPUT_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not folder.is_dir():
            continue
        anim = folder / ANIMATION_FILENAME
        folders.append(
            {
                "slug": folder.name,
                "name": folder.name,
                "has_animation": anim.exists(),
                "modified": folder.stat().st_mtime,
            }
        )
    return {"folders": folders}


@app.get("/projects/{slug}/agents")
async def get_project_agents(slug: str) -> dict:
    """Ambil agen proyek dari satu sumber: .opencode/agents/SubAgent."""
    ensure_default_subagents()
    project_dir = OUTPUT_ROOT / slug
    if not project_dir.is_dir():
        return {"agents": [], "error": "Project not found"}

    used: list[str] = []
    for path in sorted(project_dir.glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        match = re.search(r"^- Divisi:\s*`([^`]+)`", text, re.M)
        if match:
            used.append(match.group(1).strip().lower())

    agents = list_subagents()
    if used:
        wanted = set(used)
        selected = [agent for agent in agents if agent["id"] in wanted]
        if selected:
            agents = selected

    return {
        "project": slug,
        "source": ".opencode/agents/SubAgent",
        "agents": [
            {
                "agent_id": agent["id"],
                "role": agent["role"],
                "task_description": agent["description"],
            }
            for agent in agents
        ],
    }


@app.post("/stop")
async def stop_all() -> dict:
    """Hentikan semua sub-tugas yang berjalan dan reset semua agent ke IDLE."""
    for task in list(project_tasks):
        task.cancel()
    project_tasks.clear()
    stopped = await store.reset()
    return {"stopped": stopped}


@app.post("/events")
async def push_events(payload: dict = Body(...)) -> dict:
    """Webhook aktivitas: satu event atau {"events": [...]}."""
    raw = payload.get("events") if isinstance(payload.get("events"), list) else [payload]
    for item in raw:
        phase = item.get("meeting") if isinstance(item, dict) else None
        agent_id = str((item or {}).get("agent_id") or "").strip()
        if phase == "start" and agent_id and agent_id != "masteragent":
            task = item.get("task_description") or item.get("task") or ""
            await broadcast(meeting_message("start", agent_id, task, uuid.uuid4().hex))
    sent = await store.publish_many(raw, source="webhook")
    if not sent:
        raise HTTPException(status_code=400, detail="agent_id wajib / event tidak berubah")
    return {"events": sent}


@app.post("/events/log")
async def push_log(req: LogRequest) -> dict:
    """Terima baris log mentah, parse jadi event (parser yang sama dengan tail file)."""
    raw = req.lines or ([req.line] if req.line is not None else [])
    sent = []
    for line in raw:
        event = await store.publish(parse_log_line(line or ""), "log")
        if event:
            sent.append(event)
    if not sent:
        raise HTTPException(status_code=400, detail="tidak ada baris log yang bisa di-parse")
    return {"events": sent}


@app.get("/agents")
async def list_agents() -> dict:
    return {"agents": store.snapshot_events()}


@app.get("/agents/scan/default")
def scan_default_path() -> dict:
    """Direktori awal untuk pemilih proyek di UI utama."""
    return {"project_path": str(REPO_ROOT)}


@app.get("/agents/scan/browse")
def browse_agents_path(path: str | None = None) -> dict:
    """Daftar sub-folder untuk dropdown direktori di UI utama."""
    raw = (path or "").strip() or str(REPO_ROOT)
    target = Path(raw).expanduser()
    try:
        target = target.resolve(strict=True)
    except (OSError, RuntimeError):
        raise HTTPException(status_code=404, detail=f"Direktori tidak ditemukan: {raw}") from None
    if not target.is_dir():
        raise HTTPException(status_code=404, detail=f"Bukan direktori: {target}")

    dirs = []
    try:
        items = sorted(target.iterdir(), key=lambda item: item.name.lower())
    except OSError as exc:
        raise HTTPException(status_code=403, detail=f"Tidak bisa membaca folder: {exc}") from exc

    for item in items:
        if item.name.startswith("."):
            continue
        try:
            if not item.is_dir():
                continue
        except OSError:
            continue
        dirs.append(
            {
                "name": item.name,
                "path": str(item),
                "has_agents": (item / ".opencode" / "agents").is_dir(),
            }
        )
        if len(dirs) >= 500:
            break

    return {
        "path": str(target),
        "name": target.name or str(target),
        "parent": str(target.parent) if target.parent != target else None,
        "is_project": (target / ".opencode" / "agents").is_dir(),
        "dirs": dirs,
        "home": str(Path.home()),
        "repo": str(REPO_ROOT),
    }


@app.post("/agents/scan")
def scan_agents(req: ScanRequest) -> dict:
    """Pindai .opencode/agents dari direktori proyek yang dipilih."""
    try:
        return scan_agent_project(req.project_path or req.projectPath)
    except ScanError as err:
        raise HTTPException(status_code=err.status, detail=str(err)) from err


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    connected.add(ws)
    for event in store.snapshot_events():
        try:
            await ws.send_json(event)
        except Exception:
            connected.discard(ws)
            return
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        connected.discard(ws)
