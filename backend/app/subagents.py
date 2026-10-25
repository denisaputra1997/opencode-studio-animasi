"""Satu sumber kebenaran untuk subagent: .opencode/agents/SubAgent."""

from __future__ import annotations

import re
from pathlib import Path

from app.agent_scan import read_entry, role_from, slugify, titleize
from app.workspace import REPO_ROOT

AGENTS_ROOT = REPO_ROOT / ".opencode" / "agents"
SUBAGENT_DIR = AGENTS_ROOT / "SubAgent"

DEFAULT_DIVISIONS = [
    ("storyboard", "Storyboard Artist", "storyboard", "Menyusun storyboard dan alur adegan"),
    ("designer", "Character Designer", "designer", "Mendesain karakter dan proporsi"),
    ("background", "Background Artist", "background", "Membuat latar dan suasana adegan"),
    ("animator", "Animator", "animator", "Menganimasikan gerakan tiap adegan"),
    ("colorist", "Colorist", "colorist", "Mewarnai dan mengatur pencahayaan"),
    ("compositor", "Compositor", "compositor", "Menggabungkan layer dan efek"),
    ("sound", "Sound Designer", "sound", "Menyiapkan musik dan efek suara"),
    ("editor", "Editor", "editor", "Menyusun cut final dan transisi"),
]

_BODY = """Kamu adalah **{role}** di studio animasi ini, subagent di bawah MasterAgent.

## Tanggung jawab
- {task}.

## Aturan
- Kerjakan **hanya** task yang diberikan MasterAgent, jangan melebar.
- Ikuti konvensi repo (lihat `AGENTS.md`) dan pakai Bahasa Indonesia.
- Simpel: hasil yang benar dulu, bukan detail berlebih.
- Kamu **tidak** berkomunikasi langsung dengan user.

## Output
- Deliverable sesuai task (berkas/spesifikasi) + ringkasan singkat untuk MasterAgent.
"""


def _files() -> list[Path]:
    """Hanya file .md/.json langsung di SubAgent; sub-folder tidak dipakai."""
    if not SUBAGENT_DIR.is_dir():
        return []
    try:
        items = sorted(SUBAGENT_DIR.iterdir(), key=lambda item: item.name)
    except OSError:
        return []
    return [
        item
        for item in items
        if item.is_file() and not item.name.startswith(".") and re.search(r"\.(md|json)$", item.name, re.I)
    ]


def _relative(file: Path) -> str:
    try:
        return str(file.relative_to(REPO_ROOT))
    except ValueError:
        return str(file)


def list_subagents() -> list[dict]:
    result = []
    for file in _files():
        entry = read_entry(SUBAGENT_DIR, file, file.stem)
        if not entry:
            continue
        agent_id = slugify(entry["name"]) or slugify(file.stem)
        if not agent_id:
            continue
        result.append(
            {
                "id": agent_id,
                "name": entry["name"] or titleize(file.stem),
                "role": role_from(entry),
                "description": entry["description"],
                "file": _relative(file),
            }
        )
    return result


def find_subagent(agent_id: str) -> dict | None:
    key = slugify(agent_id)
    if not key:
        return None
    for agent in list_subagents():
        if agent["id"] == key or slugify(agent["name"]) == key or slugify(agent["role"]) == key:
            return agent
    return None


def subagent_persona(agent_id: str) -> str:
    agent = find_subagent(agent_id)
    if not agent:
        return ""
    for file in _files():
        if slugify(file.stem) != agent["id"]:
            continue
        entry = read_entry(SUBAGENT_DIR, file, file.stem)
        if entry:
            return entry["body"].strip()
    return ""


def ensure_subagent(agent_id: str, role: str | None = None, task: str | None = None) -> Path:
    """Buat definisi subagent bila belum ada. File yang sudah ada tidak ditimpa."""
    key = slugify(agent_id) or "agent"
    if key in ("masteragent", "master-agent"):
        return AGENTS_ROOT / "masteragent.md"
    existing = find_subagent(key)
    if existing:
        path = Path(existing["file"])
        return path if path.is_absolute() else REPO_ROOT / path

    SUBAGENT_DIR.mkdir(parents=True, exist_ok=True)
    name = (role or titleize(key)).replace("\n", " ").strip()
    summary = (task or f"Menangani task {name}").replace("\n", " ").strip()
    description = f"{name} — {summary}. Pakai saat task butuh {name}.".replace('"', '\\"')
    path = SUBAGENT_DIR / f"{key}.md"
    path.write_text(
        "---\n"
        f'description: "{description}"\n'
        "mode: subagent\n"
        "temperature: 0.3\n"
        "permission:\n"
        "  edit: allow\n"
        "  bash: allow\n"
        "---\n\n"
        + _BODY.format(role=name, task=summary.rstrip(".")),
        encoding="utf-8",
    )
    return path


def ensure_default_subagents() -> list[Path]:
    """Pastikan divisi tetap ada tanpa menimpa prompt yang sudah dirapikan."""
    created = []
    for agent_id, role, _skill, task in DEFAULT_DIVISIONS:
        if find_subagent(agent_id):
            continue
        created.append(ensure_subagent(agent_id, role, task))
    return created


def ensure_plan_subagents(subtasks) -> list[Path]:
    created = []
    for task in subtasks:
        if find_subagent(task.agent_id):
            continue
        created.append(ensure_subagent(task.agent_id, task.role, task.task_description))
    return created


def available_divisions() -> list[dict]:
    agents = list_subagents()
    if agents:
        order = {agent_id: index for index, (agent_id, _role, _skill, _task) in enumerate(DEFAULT_DIVISIONS)}
        return sorted(agents, key=lambda agent: order.get(agent["id"], len(order)))
    return [
        {"id": agent_id, "role": role, "description": task}
        for agent_id, role, _skill, task in DEFAULT_DIVISIONS
    ]
