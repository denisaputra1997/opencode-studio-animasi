import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Awaitable, Callable

STATES = {"WORKING", "IDLE", "THINKING", "DONE", "BLOCKED", "MEETING"}

STATE_ALIASES = {
    "working": "WORKING", "work": "WORKING", "busy": "WORKING",
    "run": "WORKING", "running": "WORKING", "start": "WORKING",
    "started": "WORKING", "edit": "WORKING", "editing": "WORKING",
    "write": "WORKING", "writing": "WORKING", "build": "WORKING",
    "building": "WORKING", "tool": "WORKING", "exec": "WORKING",
    "thinking": "THINKING", "think": "THINKING", "plan": "THINKING",
    "planning": "THINKING", "analyze": "THINKING", "analyzing": "THINKING",
    "read": "THINKING", "reading": "THINKING", "search": "THINKING",
    "searching": "THINKING",
    "done": "DONE", "complete": "DONE", "completed": "DONE",
    "finish": "DONE", "finished": "DONE", "success": "DONE", "ok": "DONE",
    "selesai": "DONE",
    "error": "BLOCKED", "fail": "BLOCKED", "failed": "BLOCKED",
    "blocked": "BLOCKED", "gagal": "BLOCKED", "exception": "BLOCKED",
    "idle": "IDLE", "wait": "IDLE", "waiting": "IDLE", "ready": "IDLE",
    "meeting": "MEETING", "meet": "MEETING", "handoff": "MEETING",
    "briefing": "MEETING",
}

LOG_RE = re.compile(
    r"^\s*(?:\[(?P<agent>[^\]]+)\]\s*)?"
    r"(?P<state>[A-Za-z]+)\b\s*[:\-–]?\s*(?P<task>.*)$"
)


def canonical_state(raw: object) -> str | None:
    if not raw:
        return None
    return STATE_ALIASES.get(str(raw).strip().lower())


def _clamp(value: object) -> float | None:
    if value is None:
        return None
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return None


def normalize(payload: dict, source: str = "webhook") -> dict | None:
    agent_id = str(payload.get("agent_id") or payload.get("agent") or "").strip()
    if not agent_id:
        return None
    return {
        "agent_id": agent_id,
        "role": payload.get("role") or agent_id,
        "state": canonical_state(payload.get("state")) or "WORKING",
        "task_description": payload.get("task_description") or payload.get("task") or "",
        "progress": _clamp(payload.get("progress")),
        "source": source,
        "ts": time.time(),
    }


def parse_log_line(line: str) -> dict | None:
    line = line.strip()
    if not line:
        return None
    if line.startswith("{"):
        try:
            return normalize(json.loads(line), source="log")
        except json.JSONDecodeError:
            pass
    match = LOG_RE.match(line)
    if not match or canonical_state(match.group("state")) is None:
        return None
    return normalize(
        {
            "agent_id": match.group("agent") or "agent-log",
            "state": match.group("state"),
            "task_description": match.group("task").strip(),
        },
        source="log",
    )


class ActivityStore:
    """State agent terkini + broadcast. Event identik tidak diulang."""

    def __init__(self, broadcast: Callable[[dict], Awaitable[None]]) -> None:
        self._broadcast = broadcast
        self.snapshot: dict[str, dict] = {}

    def snapshot_events(self) -> list[dict]:
        return list(self.snapshot.values())

    async def publish(self, event: dict | None, source: str | None = None) -> dict | None:
        if not event:
            return None
        if source:
            event["source"] = source
        if self._same(event, self.snapshot.get(event["agent_id"])):
            return None
        self.snapshot[event["agent_id"]] = event
        await self._broadcast(event)
        return event

    async def publish_many(self, payloads: list[dict], source: str = "webhook") -> list[dict]:
        sent = []
        for payload in payloads:
            event = await self.publish(normalize(payload, source), source)
            if event:
                sent.append(event)
        return sent

    async def reset(self, state: str = "IDLE", task: str = "Dihentikan") -> list[dict]:
        """Set semua agent ke state tertentu (default IDLE) dan broadcast."""
        sent = []
        for agent_id, event in list(self.snapshot.items()):
            new = {
                **event,
                "state": state,
                "task_description": task,
                "progress": None,
                "ts": time.time(),
            }
            published = await self.publish(new)
            if published:
                sent.append(published)
        return sent

    @staticmethod
    def _same(new: dict, old: dict | None) -> bool:
        if not old:
            return False
        return (
            new["state"] == old["state"]
            and new.get("task_description") == old.get("task_description")
            and new.get("progress") == old.get("progress")
        )


async def tail_log(
    path: str,
    store: ActivityStore,
    poll: float = 1.0,
    from_end: bool = True,
) -> None:
    """Pantau file log; tiap baris baru di-parse jadi event lalu dipublish."""
    file = Path(path)
    pos = file.stat().st_size if from_end and file.exists() else 0
    while True:
        try:
            if file.exists():
                size = file.stat().st_size
                if size < pos:
                    pos = 0
                with file.open("r", encoding="utf-8", errors="replace") as fh:
                    fh.seek(pos)
                    for line in fh:
                        await store.publish(parse_log_line(line), "log")
                    pos = fh.tell()
        except OSError:
            pass
        await asyncio.sleep(poll)


def log_path_from_env() -> str | None:
    return os.getenv("ACTIVITY_LOG") or None
