"""Scan agent definitions from a project's .opencode/agents folder."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

STATUSES = ["idle", "working", "thinking", "done", "blocked", "meeting"]

STATUS_ALIASES = {
    "idle": "idle",
    "menganggur": "idle",
    "standby": "idle",
    "waiting": "idle",
    "menunggu": "idle",
    "working": "working",
    "work": "working",
    "running": "working",
    "process": "working",
    "processing": "working",
    "bekerja": "working",
    "mengerjakan": "working",
    "in_progress": "working",
    "thinking": "thinking",
    "berpikir": "thinking",
    "planning": "thinking",
    "menyusun": "thinking",
    "done": "done",
    "complete": "done",
    "completed": "done",
    "finish": "done",
    "finished": "done",
    "selesai": "done",
    "berhasil": "done",
    "blocked": "blocked",
    "error": "blocked",
    "failed": "blocked",
    "gagal": "blocked",
    "meeting": "meeting",
    "rapat": "meeting",
    "briefing": "meeting",
}

STATUS_PATTERNS = [
    ("blocked", re.compile(r"\b(blocked|error|failed|gagal|failure)\b", re.I)),
    ("done", re.compile(r"\b(done|complete|completed|finish|finished|selesai|berhasil)\b", re.I)),
    ("meeting", re.compile(r"\b(meeting|rapat|briefing)\b", re.I)),
    ("thinking", re.compile(r"\b(thinking|planning|berpikir|menyusun)\b", re.I)),
    ("working", re.compile(r"\b(working|running|processing|in_progress|bekerja|mengerjakan)\b", re.I)),
    ("idle", re.compile(r"\b(idle|waiting|standby|menganggur|menunggu)\b", re.I)),
]

MAX_LOG_BYTES = 64 * 1024


class ScanError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def normalize_status(value: object, fallback: str = "idle") -> str:
    if not isinstance(value, str):
        return fallback
    key = re.sub(r"\s+", "_", value.strip().lower())
    return STATUS_ALIASES.get(key, key if key in STATUSES else fallback)


def slugify(value: object) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", str(value or "").strip().lower())
    return text.strip("-")


def titleize(value: object) -> str:
    text = re.sub(r"[-_]+", " ", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), text)


def _inside(base: Path, target: Path) -> bool:
    try:
        return target.resolve().is_relative_to(base.resolve())
    except OSError:
        return False


def _safe_read(base: Path, file: Path) -> str | None:
    if not _inside(base, file):
        return None
    try:
        return file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    source = (text or "").lstrip("\ufeff")
    lines = source.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, source

    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return {}, source

    data: dict[str, str] = {}
    i = 1
    while i < end:
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", lines[i])
        if not match:
            i += 1
            continue
        key, value = match.group(1), match.group(2).strip()
        if value in (">", "|"):
            parts = []
            j = i + 1
            while j < end and (lines[j][:1].isspace() or not lines[j].strip()):
                if lines[j].strip():
                    parts.append(lines[j].strip())
                j += 1
            data[key] = " ".join(parts)
            i = j
            continue
        data[key] = value.strip("\"'").strip()
        i += 1

    return data, "\n".join(lines[end + 1:])


def role_from(entry: dict) -> str:
    description = (entry.get("description") or "").strip()
    short = re.split(r"\s+[—–]\s+|\s+-\s+", description, maxsplit=1)[0].strip()
    if short and len(short) <= 48:
        return short

    heading = re.search(r"^#\s+(.+)$", entry.get("body") or "", re.M)
    if heading:
        return re.sub(r"[*_`]", "", heading.group(1)).strip()

    return titleize(entry.get("name") or "")


def read_entry(base_dir: Path, file: Path, fallback_name: str) -> dict | None:
    raw = _safe_read(base_dir, file)
    if raw is None:
        return None

    if file.suffix.lower() == ".json":
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        return {
            "name": str(data.get("name") or fallback_name),
            "description": str(data.get("description") or data.get("role") or ""),
            "mode": str(data.get("mode") or ""),
            "model": str(data.get("model") or ""),
            "body": "",
        }

    data, body = parse_frontmatter(raw)
    return {
        "name": str(data.get("name") or fallback_name),
        "description": str(data.get("description") or ""),
        "mode": str(data.get("mode") or ""),
        "model": str(data.get("model") or ""),
        "body": body,
    }


def list_entries(directory: Path) -> list[tuple[Path, str]]:
    """Hanya berkas .md/.json langsung di folder; sub-folder diabaikan."""
    files: list[tuple[Path, str]] = []
    try:
        items = sorted(directory.iterdir(), key=lambda item: item.name)
    except OSError:
        return files

    for item in items:
        if not item.is_file() or item.name.startswith("."):
            continue
        if re.search(r"\.(md|json)$", item.name, re.I):
            files.append((item, item.stem))

    return files


def find_master_file(agents_dir: Path) -> Path | None:
    try:
        items = sorted(agents_dir.iterdir(), key=lambda item: item.name)
    except OSError:
        return None

    for item in items:
        if not item.is_file() or not re.search(r"\.(md|json)$", item.name, re.I):
            continue
        entry = read_entry(agents_dir, item, item.stem)
        if not entry:
            continue
        if re.search(r"master[- ]?agent", entry["name"], re.I) or entry["mode"] == "primary":
            return item

    named = next(
        (item for item in items if item.is_file() and re.match(r"^master-?agent\.(md|json)$", item.name, re.I)),
        None,
    )
    if named is not None:
        return named

    return items[0] if items else None


def find_subagent_files(agents_dir: Path) -> list[Path]:
    files: list[Path] = []
    try:
        for item in agents_dir.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                for subitem in item.iterdir():
                    if subitem.is_file() and re.search(r"\.(md|json)$", subitem.name, re.I):
                        files.append(subitem)
            elif item.is_file() and re.search(r"\.(md|json)$", item.name, re.I):
                pass
    except OSError:
        pass
    return sorted(files, key=lambda f: f.name)


def resolve_project(project_path: str | None) -> tuple[Path, Path]:
    if not project_path or not str(project_path).strip():
        raise ScanError("project_path wajib diisi", 400)

    root = Path(str(project_path).strip()).expanduser()
    try:
        root = root.resolve(strict=True)
    except (OSError, RuntimeError):
        raise ScanError(f"Direktori tidak ditemukan: {root}", 404) from None

    if not root.is_dir():
        raise ScanError(f"Bukan direktori: {root}", 404)

    agents_dir = root / ".opencode" / "agents"
    if not agents_dir.is_dir():
        raise ScanError(f"Folder .opencode/agents tidak ditemukan di {root}", 404)

    return root, agents_dir


def agent_refs(masteragent: dict | None, agents: list[dict]) -> dict[str, list[str]]:
    refs: dict[str, list[str]] = {}
    targets = ([masteragent] if masteragent else []) + agents
    for agent in targets:
        names = {agent["id"], slugify(agent["name"]), agent["name"].lower()}
        for value in list(names):
            slug = slugify(value)
            if slug:
                names.add(slug)
        refs[agent["id"]] = [name for name in names if name]
    return refs


def parse_log_lines(lines: list[str], refs: dict[str, list[str]]) -> dict[str, str]:
    ordered = sorted(
        ((agent_id, name.lower()) for agent_id, names in refs.items() for name in names if len(name) >= 2),
        key=lambda item: len(item[1]),
        reverse=True,
    )

    found: dict[str, str] = {}
    for line in lines:
        raw = (line or "").strip()
        if not raw:
            continue

        if raw.startswith("{"):
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            agent = data.get("agent_id") or data.get("agentId") or data.get("agent") or data.get("name") or data.get("id")
            status = normalize_status(data.get("status") or data.get("state") or data.get("phase"), "")
            if agent and status:
                found[slugify(agent)] = status
            continue

        status = next((name for name, pattern in STATUS_PATTERNS if pattern.search(raw)), None)
        if not status:
            continue
        lower = raw.lower()
        for agent_id, name in ordered:
            pattern = re.compile(rf"(^|[^a-z0-9]){re.escape(name)}([^a-z0-9]|$)")
            if pattern.search(lower):
                found[agent_id] = status
                break

    return found


def discover_log_file(root: Path) -> Path | None:
    env_file = os.getenv("STUDIO_LOG_FILE")
    if env_file:
        candidate = Path(env_file).expanduser()
        if candidate.is_file():
            return candidate.resolve()

    for candidate in (
        root / ".opencode" / "studio.log",
        root / ".opencode" / "activity.log",
        root / "studio.log",
    ):
        if candidate.is_file() and _inside(root, candidate):
            return candidate

    for directory in (root / ".opencode" / "logs", root / "logs"):
        if not directory.is_dir():
            continue
        try:
            logs = [
                entry
                for entry in directory.iterdir()
                if entry.is_file() and re.search(r"\.(log|jsonl)$", entry.name, re.I)
            ]
            logs.sort(key=lambda entry: entry.stat().st_mtime, reverse=True)
        except OSError:
            continue
        if logs and _inside(root, logs[0]):
            return logs[0]

    return None


def read_log_tail(file: Path) -> list[str]:
    try:
        with file.open("rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            start = max(0, size - MAX_LOG_BYTES)
            handle.seek(start)
            chunk = handle.read()
    except OSError:
        return []

    lines = chunk.decode("utf-8", errors="replace").splitlines()
    if start > 0 and lines:
        lines = lines[1:]
    return lines


def to_status_map(data: object) -> dict[str, str]:
    result: dict[str, str] = {}
    if data is None:
        return result

    def assign(key: object, value: object) -> None:
        agent_id = slugify(key)
        status = normalize_status(value, "")
        if agent_id and status:
            result[agent_id] = status

    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            assign(
                item.get("id") or item.get("agent") or item.get("name"),
                item.get("status") or item.get("state"),
            )
        return result

    if not isinstance(data, dict):
        return result

    nested = data.get("agents") if isinstance(data.get("agents"), (dict, list)) else data
    if isinstance(nested, list):
        return to_status_map(nested)

    for key, value in nested.items():
        if isinstance(value, dict):
            assign(key, value.get("status") or value.get("state"))
        else:
            assign(key, value)

    return result


def read_status_file(root: Path) -> tuple[str | None, dict[str, str]]:
    for file in (
        root / ".opencode" / "studio-status.json",
        root / ".opencode" / "status.json",
        root / "studio-status.json",
    ):
        if not file.is_file() or not _inside(root, file):
            continue
        raw = _safe_read(root, file)
        if raw is None:
            continue
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        return os.path.relpath(file, root), to_status_map(data)

    return None, {}


def apply_statuses(targets: list[dict], status_map: dict[str, str]) -> None:
    for agent in targets:
        status = status_map.get(agent["id"])
        if status:
            agent["status"] = status


def count_statuses(targets: list[dict]) -> dict[str, int]:
    totals = {status: 0 for status in STATUSES}
    for agent in targets:
        status = agent.get("status")
        if status in totals:
            totals[status] += 1
    totals["total"] = len(targets)
    return totals


def scan_project(project_path: str | None) -> dict:
    root, agents_dir = resolve_project(project_path)
    warnings: list[str] = []
    agents: list[dict] = []
    seen: set[str] = set()

    master_file = find_master_file(agents_dir)
    masteragent = None
    if master_file is not None:
        entry = read_entry(agents_dir, master_file, "masteragent")
        if entry:
            masteragent = {
                "id": "masteragent",
                "name": entry["name"] or "masteragent",
                "role": "Master Agent",
                "status": "idle",
                "desk_id": 0,
                "description": entry["description"],
                "mode": entry["mode"] or "primary",
                "model": entry["model"],
                "file": os.path.relpath(master_file, root),
                "is_master": True,
            }
            seen.add("masteragent")
    if masteragent is None:
        warnings.append("masteragent.md tidak ditemukan di .opencode/agents")

    subagent_files = find_subagent_files(agents_dir)
    if not subagent_files:
        warnings.append("Tidak ada file agen di sub-folder .opencode/agents/")

    sources: list[tuple[Path, str]] = [(f, f.stem) for f in subagent_files]

    for file, fallback_name in sources:
        entry = read_entry(agents_dir, file, fallback_name)
        if not entry:
            warnings.append(f"Gagal membaca berkas agen: {os.path.relpath(file, root)}")
            continue

        agent_id = slugify(entry["name"]) or slugify(fallback_name) or "agent"
        if agent_id in ("masteragent", "master-agent"):
            continue

        unique = agent_id
        counter = 2
        while unique in seen:
            unique = f"{agent_id}-{counter}"
            counter += 1
        agent_id = unique
        seen.add(agent_id)

        agents.append(
            {
                "id": agent_id,
                "name": entry["name"] or titleize(fallback_name),
                "role": role_from(entry),
                "status": "idle",
                "desk_id": len(agents) + 1,
                "description": entry["description"],
                "mode": entry["mode"] or "subagent",
                "model": entry["model"],
                "file": os.path.relpath(file, root),
                "is_master": False,
            }
        )

    agents.sort(key=lambda agent: agent["name"].lower())
    for index, agent in enumerate(agents):
        agent["desk_id"] = index + 1

    status_file, status_map = read_status_file(root)
    log_file = discover_log_file(root)
    if log_file is not None:
        status_map.update(parse_log_lines(read_log_tail(log_file), agent_refs(masteragent, agents)))

    targets = ([masteragent] if masteragent else []) + agents
    apply_statuses(targets, status_map)

    return {
        "projectPath": str(root),
        "agentsDir": os.path.relpath(agents_dir, root),
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "masteragent": masteragent,
        "agents": agents,
        "warnings": warnings,
        "statusFile": status_file,
        "logFile": os.path.relpath(log_file, root) if log_file else None,
        "counts": count_statuses(targets),
    }
