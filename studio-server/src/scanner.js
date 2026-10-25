import fs from "node:fs";
import path from "node:path";

export class ScanError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const STATUS_ALIASES = {
  idle: "idle",
  menganggur: "idle",
  standby: "idle",
  waiting: "idle",
  menunggu: "idle",
  working: "working",
  work: "working",
  running: "working",
  process: "working",
  processing: "working",
  bekerja: "working",
  mengerjakan: "working",
  in_progress: "working",
  thinking: "thinking",
  berpikir: "thinking",
  planning: "thinking",
  menyusun: "thinking",
  done: "done",
  complete: "done",
  completed: "done",
  finish: "done",
  finished: "done",
  selesai: "done",
  berhasil: "done",
  blocked: "blocked",
  error: "blocked",
  failed: "blocked",
  gagal: "blocked",
  meeting: "meeting",
  rapat: "meeting",
  briefing: "meeting",
};

export const STATUSES = ["idle", "working", "thinking", "done", "blocked", "meeting"];

export function normalizeStatus(value, fallback = "idle") {
  if (typeof value !== "string") return fallback;
  const key = value.trim().toLowerCase().replace(/\s+/g, "_");
  return STATUS_ALIASES[key] || (STATUSES.includes(key) ? key : fallback);
}

export function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function titleize(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function realInside(base, target) {
  try {
    const realBase = fs.realpathSync(base);
    const realTarget = fs.realpathSync(target);
    return realTarget === realBase || realTarget.startsWith(realBase + path.sep);
  } catch {
    return false;
  }
}

function safeRead(base, file) {
  if (!realInside(base, file)) return null;
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function parseFrontmatter(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  const data = {};
  if ((lines[0] || "").trim() !== "---") return { data, body: source };

  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { data, body: source };

  for (let i = 1; i < end; i += 1) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    let value = match[2].trim();
    if (value === ">" || value === "|") {
      const parts = [];
      let j = i + 1;
      while (j < end && (/^\s+/.test(lines[j]) || lines[j].trim() === "")) {
        if (lines[j].trim()) parts.push(lines[j].trim());
        j += 1;
      }
      value = parts.join(" ");
      i = j - 1;
    }
    data[match[1]] = value.replace(/^["']|["']$/g, "").trim();
  }

  return { data, body: lines.slice(end + 1).join("\n") };
}

function roleFrom(entry) {
  const description = String(entry.description || "").trim();
  const short = description.split(/\s+[—–]\s+|\s+-\s+/)[0].trim();
  if (short && short.length <= 48) return short;

  const heading = /^#\s+(.+)$/m.exec(entry.body || "");
  if (heading) return heading[1].replace(/[*_`]/g, "").trim();

  return titleize(entry.name);
}

function readEntry(baseDir, file, fallbackName) {
  const raw = safeRead(baseDir, file);
  if (raw == null) return null;

  const ext = path.extname(file).toLowerCase();
  if (ext === ".json") {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      return {
        name: String(data.name || fallbackName),
        description: String(data.description || data.role || ""),
        mode: String(data.mode || ""),
        model: String(data.model || ""),
        body: "",
      };
    } catch {
      return null;
    }
  }

  const { data, body } = parseFrontmatter(raw);
  return {
    name: String(data.name || fallbackName),
    description: String(data.description || ""),
    mode: String(data.mode || ""),
    model: String(data.model || ""),
    body,
  };
}

function listEntries(dir) {
  const files = [];
  let items = [];
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const item of items) {
    if (item.name.startsWith(".") || !item.isFile()) continue;
    if (/\.(md|json)$/i.test(item.name)) {
      files.push({
        file: path.join(dir, item.name),
        fallbackName: path.basename(item.name, path.extname(item.name)),
      });
    }
  }

  return files.sort((a, b) => a.file.localeCompare(b.file));
}

function findMasterFile(agentsDir) {
  const direct = path.join(agentsDir, "masteragent.md");
  if (fs.existsSync(direct)) return direct;

  let items = [];
  try {
    items = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const named = items.find(
    (item) => item.isFile() && /^master-?agent\.(md|json)$/i.test(item.name)
  );
  if (named) return path.join(agentsDir, named.name);

  for (const item of items) {
    if (!item.isFile() || !/\.(md|json)$/i.test(item.name)) continue;
    const full = path.join(agentsDir, item.name);
    const entry = readEntry(agentsDir, full, item.name);
    if (!entry) continue;
    if (/master[- ]?agent/i.test(entry.name) || entry.mode === "primary") return full;
  }

  return null;
}

function findSubAgentDir(agentsDir) {
  let items = [];
  try {
    items = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const found = items.find((item) => item.isDirectory() && /^subagent$/i.test(item.name));
  return found ? path.join(agentsDir, found.name) : null;
}

export function resolveProject(projectPath) {
  if (!projectPath || typeof projectPath !== "string") {
    throw new ScanError("projectPath wajib diisi", 400);
  }

  const root = path.resolve(projectPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new ScanError(`Direktori tidak ditemukan: ${root}`, 404);
  }

  const agentsDir = path.join(root, ".opencode", "agents");
  if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
    throw new ScanError(`Folder .opencode/agents tidak ditemukan di ${root}`, 404);
  }

  return { root, agentsDir };
}

export function scanProject(projectPath) {
  const { root, agentsDir } = resolveProject(projectPath);
  const warnings = [];
  const agents = [];
  const seen = new Set();

  const masterFile = findMasterFile(agentsDir);
  let masteragent = null;

  if (masterFile) {
    const entry = readEntry(agentsDir, masterFile, "masteragent");
    if (entry) {
      masteragent = {
        id: "masteragent",
        name: entry.name || "masteragent",
        role: "Master Agent",
        status: "idle",
        desk_id: 0,
        description: entry.description,
        mode: entry.mode || "primary",
        model: entry.model,
        file: path.relative(root, masterFile),
        is_master: true,
      };
      seen.add("masteragent");
    }
  } else {
    warnings.push("masteragent.md tidak ditemukan di .opencode/agents");
  }

  const subDir = findSubAgentDir(agentsDir);
  if (!subDir) warnings.push("Folder SubAgent tidak ditemukan di .opencode/agents");

  const sources = subDir ? listEntries(subDir) : [];
  if (subDir) {
    try {
      if (fs.readdirSync(subDir, { withFileTypes: true }).some((item) => item.isDirectory() && !item.name.startsWith("."))) {
        warnings.push("Sub-folder di .opencode/agents/SubAgent diabaikan");
      }
    } catch {
      // abaikan
    }
  }

  for (const item of sources) {
    const entry = readEntry(agentsDir, item.file, item.fallbackName);
    if (!entry) {
      warnings.push(`Gagal membaca berkas agen: ${path.relative(root, item.file)}`);
      continue;
    }

    let id = slugify(entry.name) || slugify(item.fallbackName) || "agent";
    if (id === "masteragent" || id === "master-agent") continue;
    let unique = id;
    let counter = 2;
    while (seen.has(unique)) {
      unique = `${id}-${counter}`;
      counter += 1;
    }
    id = unique;
    seen.add(id);

    agents.push({
      id,
      name: entry.name || titleize(item.fallbackName),
      role: roleFrom(entry),
      status: "idle",
      desk_id: agents.length + 1,
      description: entry.description,
      mode: entry.mode || "subagent",
      model: entry.model,
      file: path.relative(root, item.file),
      is_master: false,
    });
  }

  agents.sort((a, b) => a.name.localeCompare(b.name));
  agents.forEach((agent, index) => {
    agent.desk_id = index + 1;
  });

  return {
    projectPath: root,
    agentsDir: path.relative(root, agentsDir),
    scannedAt: new Date().toISOString(),
    masteragent,
    agents,
    warnings,
  };
}

export function fingerprintAgents(agentsDir) {
  const parts = [];
  const walk = (dir) => {
    let items = [];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith(".")) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(full);
      } else if (/\.(md|json)$/i.test(item.name)) {
        try {
          const stat = fs.statSync(full);
          parts.push(`${path.relative(agentsDir, full)}:${stat.mtimeMs}:${stat.size}`);
        } catch {
          continue;
        }
      }
    }
  };
  walk(agentsDir);
  return parts.join("|");
}

export function readStatusFile(root) {
  const candidates = [
    path.join(root, ".opencode", "studio-status.json"),
    path.join(root, ".opencode", "status.json"),
    path.join(root, "studio-status.json"),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file) || !realInside(root, file)) continue;
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    return { file: path.relative(root, file), map: toStatusMap(data) };
  }

  return { file: null, map: {} };
}

function toStatusMap(data) {
  const map = {};
  if (!data) return map;

  const assign = (key, value) => {
    const id = slugify(key);
    const status = normalizeStatus(value, "");
    if (id && status) map[id] = status;
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      assign(item.id || item.agent || item.name, item.status || item.state);
    }
    return map;
  }

  if (typeof data !== "object") return map;

  const nested = data.agents && typeof data.agents === "object" ? data.agents : data;
  if (Array.isArray(nested)) {
    for (const item of nested) {
      if (!item || typeof item !== "object") continue;
      assign(item.id || item.agent || item.name, item.status || item.state);
    }
    return map;
  }

  for (const [key, value] of Object.entries(nested)) {
    if (value && typeof value === "object") {
      assign(key, value.status || value.state);
    } else {
      assign(key, value);
    }
  }
  return map;
}

export function discoverLogFile(root) {
  const envFile = process.env.STUDIO_LOG_FILE;
  if (envFile && fs.existsSync(envFile)) return path.resolve(envFile);

  const candidates = [
    path.join(root, ".opencode", "studio.log"),
    path.join(root, ".opencode", "activity.log"),
    path.join(root, "studio.log"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file) && realInside(root, file)) return file;
  }

  for (const dir of [path.join(root, ".opencode", "logs"), path.join(root, "logs")]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const newest = fs
        .readdirSync(dir)
        .filter((name) => /\.(log|jsonl)$/i.test(name))
        .map((name) => path.join(dir, name))
        .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime)[0];
      if (newest && realInside(root, newest.file)) return newest.file;
    } catch {
      continue;
    }
  }

  return null;
}

const STATUS_PATTERNS = [
  ["blocked", /\b(blocked|error|failed|gagal|failure)\b/i],
  ["done", /\b(done|complete|completed|finish|finished|selesai|berhasil)\b/i],
  ["meeting", /\b(meeting|rapat|briefing)\b/i],
  ["thinking", /\b(thinking|planning|berpikir|menyusun)\b/i],
  ["working", /\b(working|running|processing|in_progress|bekerja|mengerjakan)\b/i],
  ["idle", /\b(idle|waiting|standby|menganggur|menunggu)\b/i],
];

export function createLogParser(agentRefs) {
  const refs = [];
  for (const [id, names] of Object.entries(agentRefs)) {
    for (const name of names) {
      if (name && name.length >= 2) refs.push({ id, name: name.toLowerCase() });
    }
  }
  refs.sort((a, b) => b.name.length - a.name.length);

  return function parseLine(line) {
    const raw = String(line || "").trim();
    if (!raw) return null;

    if (raw.startsWith("{")) {
      try {
        const data = JSON.parse(raw);
        const agent = data.agent_id || data.agentId || data.agent || data.name || data.id;
        const status = normalizeStatus(data.status || data.state || data.phase, "");
        if (agent && status) return { id: slugify(agent), status };
      } catch {
        return null;
      }
    }

    const lower = raw.toLowerCase();
    let status = null;
    for (const [name, pattern] of STATUS_PATTERNS) {
      if (pattern.test(lower)) {
        status = name;
        break;
      }
    }
    if (!status) return null;

    for (const ref of refs) {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(ref.name)}([^a-z0-9]|$)`);
      if (pattern.test(lower)) return { id: ref.id, status };
    }

    return null;
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function agentRefs(state) {
  const refs = {};
  const all = [];
  if (state.masteragent) all.push(state.masteragent);
  all.push(...state.agents);

  for (const agent of all) {
    const names = new Set([agent.id, slugify(agent.name), agent.name.toLowerCase()]);
    for (const value of [...names]) {
      const slug = slugify(value);
      if (slug) names.add(slug);
    }
    refs[agent.id] = [...names].filter(Boolean);
  }
  return refs;
}

export function applyStatuses(state, map) {
  let changed = false;
  const targets = [];
  if (state.masteragent) targets.push(state.masteragent);
  targets.push(...state.agents);

  for (const agent of targets) {
    const status = map[agent.id];
    if (status && status !== agent.status) {
      agent.status = status;
      changed = true;
    }
  }
  return changed;
}

export function countStatuses(state) {
  const totals = { idle: 0, working: 0, thinking: 0, done: 0, blocked: 0, meeting: 0 };
  const targets = [];
  if (state.masteragent) targets.push(state.masteragent);
  targets.push(...state.agents);
  for (const agent of targets) {
    if (totals[agent.status] != null) totals[agent.status] += 1;
  }
  totals.total = targets.length;
  return totals;
}
