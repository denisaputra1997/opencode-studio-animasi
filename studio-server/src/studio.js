import fs from "node:fs";
import path from "node:path";

import {
  ScanError,
  agentRefs,
  applyStatuses,
  countStatuses,
  createLogParser,
  discoverLogFile,
  fingerprintAgents,
  normalizeStatus,
  readStatusFile,
  scanProject,
  slugify,
} from "./scanner.js";

const MAX_LOG_CHUNK = 512 * 1024;
const INITIAL_LOG_BYTES = 64 * 1024;

export class Studio {
  constructor({ pollMs = 1500 } = {}) {
    this.pollMs = pollMs;
    this.state = null;
    this.root = null;
    this.agentsDir = null;
    this.fingerprint = "";
    this.statusFingerprint = "";
    this.overrides = new Map();
    this.logFile = null;
    this.logOffset = 0;
    this.logPartial = "";
    this.parser = null;
    this.subscribers = new Set();
    this.timer = null;
  }

  snapshot() {
    if (!this.state) return null;
    return {
      ...this.state,
      counts: countStatuses(this.state),
      updatedAt: new Date().toISOString(),
    };
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  publish() {
    const snapshot = this.snapshot();
    if (!snapshot) return;
    for (const listener of this.subscribers) {
      try {
        listener(snapshot);
      } catch {
        continue;
      }
    }
  }

  rescan(projectPath) {
    const next = scanProject(projectPath);
    this.state = next;
    this.root = next.projectPath;
    this.agentsDir = path.join(this.root, ".opencode", "agents");
    this.fingerprint = fingerprintAgents(this.agentsDir);
    this.parser = createLogParser(agentRefs(next));
    this.applyOverrides();
    return next;
  }

  scan(projectPath, { logFile } = {}) {
    this.stop();
    this.state = null;
    this.overrides = new Map();
    this.logFile = null;
    this.logOffset = 0;
    this.logPartial = "";

    const state = this.rescan(projectPath);

    const status = readStatusFile(this.root);
    this.statusFingerprint = JSON.stringify(status.map);
    for (const [id, value] of Object.entries(status.map)) this.overrides.set(id, value);

    if (logFile) {
      const candidate = path.resolve(logFile);
      const realRoot = fs.realpathSync(this.root);
      if (
        candidate.startsWith(realRoot + path.sep) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        this.logFile = candidate;
      } else {
        state.warnings.push(`logFile diabaikan (di luar proyek atau tidak ada): ${logFile}`);
      }
    }

    this.applyOverrides();
    this.seedLog();
    this.start();
    this.publish();
    return this.snapshot();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.tick(), this.pollMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  tick() {
    if (!this.root) return;
    try {
      const fingerprint = fingerprintAgents(this.agentsDir);
      if (fingerprint !== this.fingerprint) {
        this.fingerprint = fingerprint;
        this.rescan(this.root);
        this.publish();
      }
      this.syncStatusFile();
      this.tailLog();
    } catch {
      return;
    }
  }

  syncStatusFile() {
    const { map } = readStatusFile(this.root);
    const fingerprint = JSON.stringify(map);
    if (fingerprint === this.statusFingerprint) return;
    this.statusFingerprint = fingerprint;
    this.mergeStatuses(map);
  }

  mergeStatuses(map) {
    let touched = false;
    for (const [id, value] of Object.entries(map)) {
      this.overrides.set(id, value);
      touched = true;
    }
    if (!touched) return;
    if (this.applyOverrides()) this.publish();
  }

  applyOverrides() {
    if (!this.state) return false;
    const map = Object.fromEntries(this.overrides);
    return applyStatuses(this.state, map);
  }

  setStatus(agent, status) {
    if (!this.state) throw new ScanError("Belum ada proyek yang di-scan", 409);
    const value = normalizeStatus(status, "");
    if (!value) throw new ScanError(`Status tidak dikenal: ${status}`, 400);

    const id = this.resolveAgent(agent);
    if (!id) throw new ScanError(`Agen tidak ditemukan: ${agent}`, 404);

    this.overrides.set(id, value);
    this.applyOverrides();
    this.publish();
    return this.snapshot();
  }

  resolveAgent(agent) {
    const key = slugify(agent);
    if (!key) return null;
    const all = [];
    if (this.state.masteragent) all.push(this.state.masteragent);
    all.push(...this.state.agents);
    const exact = all.find((item) => item.id === key);
    if (exact) return exact.id;
    const byName = all.find((item) => slugify(item.name) === key);
    return byName ? byName.id : null;
  }

  seedLog() {
    if (!this.logFile) this.logFile = discoverLogFile(this.root);
    if (!this.logFile) return;

    let stat;
    try {
      stat = fs.statSync(this.logFile);
    } catch {
      this.logFile = null;
      return;
    }

    const start = Math.max(0, stat.size - INITIAL_LOG_BYTES);
    const chunk = this.readChunk(start, stat.size);
    this.logOffset = stat.size;
    if (!chunk) return;

    const lines = chunk.split(/\r?\n/);
    if (start > 0) lines.shift();
    this.parseLines(lines);
  }

  tailLog() {
    const discovered = discoverLogFile(this.root);
    if (discovered && discovered !== this.logFile) {
      this.logFile = discovered;
      this.logOffset = 0;
      this.logPartial = "";
      this.seedLog();
      return;
    }
    if (!this.logFile) return;

    let stat;
    try {
      stat = fs.statSync(this.logFile);
    } catch {
      this.logFile = null;
      return;
    }

    if (stat.size < this.logOffset) {
      this.logOffset = 0;
      this.logPartial = "";
    }
    if (stat.size === this.logOffset) return;

    const start = Math.max(this.logOffset, stat.size - MAX_LOG_CHUNK);
    const chunk = this.readChunk(start, stat.size);
    this.logOffset = stat.size;
    if (!chunk) return;

    const lines = (this.logPartial + chunk).split(/\r?\n/);
    this.logPartial = lines.pop() || "";
    this.parseLines(lines);
  }

  readChunk(start, end) {
    let fd;
    try {
      fd = fs.openSync(this.logFile, "r");
      const length = end - start;
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, start);
      return buffer.toString("utf8");
    } catch {
      return "";
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignored */
        }
      }
    }
  }

  parseLines(lines) {
    if (!this.parser) return;
    let touched = false;
    for (const line of lines) {
      const hit = this.parser(line);
      if (!hit) continue;
      if (this.overrides.get(hit.id) === hit.status) continue;
      this.overrides.set(hit.id, hit.status);
      touched = true;
    }
    if (touched && this.applyOverrides()) this.publish();
  }
}
