import asyncio
import os
import random
from contextlib import asynccontextmanager

from fastapi import Body, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from agents.masteragent import make_plan, plan_to_events
from app.events import ActivityStore, log_path_from_env, normalize, parse_log_line, tail_log

AGENTS = [
    {"agent_id": "masteragent", "role": "masteragent"},
    {"agent_id": "storyboard", "role": "Storyboard Artist"},
    {"agent_id": "designer", "role": "Character Designer"},
    {"agent_id": "animator", "role": "Animator"},
    {"agent_id": "colorist", "role": "Colorist"},
    {"agent_id": "compositor", "role": "Compositor"},
]

TASKS = [
    "Mengoordinasi sub-agent",
    "Menyusun storyboard adegan",
    "Mendesain karakter utama",
    "Menganimasikan adegan pembuka",
    "Mewarnai keyframe",
    "Menggabungkan layer latar",
]

SIM_STATES = ["THINKING", "WORKING", "WORKING", "DONE", "BLOCKED", "IDLE"]

connected: set[WebSocket] = set()


async def broadcast(event: dict) -> None:
    for ws in list(connected):
        try:
            await ws.send_json(event)
        except Exception:
            connected.discard(ws)


store = ActivityStore(broadcast)


async def event_producer() -> None:
    """Simulator opsional (SIMULATE_EVENTS=1) untuk uji canvas tanpa sumber asli."""
    while True:
        agent = random.choice(AGENTS)
        state = random.choice(SIM_STATES)
        progress = random.choice([None, None, round(random.random(), 2)]) if state == "WORKING" else None
        await store.publish(
            normalize(
                {
                    "agent_id": agent["agent_id"],
                    "role": agent["role"],
                    "state": state,
                    "task_description": random.choice(TASKS),
                    "progress": progress,
                },
                "sim",
            )
        )
        await asyncio.sleep(3)


@asynccontextmanager
async def lifespan(app: FastAPI):
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


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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

    events = plan_to_events(plan)
    sent = await store.publish_many(events, source="prompt")
    await store.publish(
        normalize(
            {
                "agent_id": "masteragent",
                "role": "masteragent",
                "state": "DONE",
                "task_description": f"Rencana siap: {len(events)} sub-tugas",
            },
            "prompt",
        )
    )
    return {"subtasks": sent}


@app.post("/events")
async def push_events(payload: dict = Body(...)) -> dict:
    """Webhook aktivitas: satu event atau {"events": [...]}."""
    raw = payload.get("events") if isinstance(payload.get("events"), list) else [payload]
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
