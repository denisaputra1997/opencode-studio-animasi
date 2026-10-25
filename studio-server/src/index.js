import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { ScanError } from "./scanner.js";
import { Studio } from "./studio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const POLL_MS = Number(process.env.STUDIO_POLL_MS || 1500);

const app = express();
const studio = new Studio({ pollMs: POLL_MS });

app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (req, res) => {
  const snapshot = studio.snapshot();
  res.json({
    ok: true,
    projectPath: snapshot ? snapshot.projectPath : null,
    agents: snapshot ? snapshot.counts.total : 0,
  });
});

function projectFrom(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  return body.projectPath || req.query.projectPath;
}

function scanHandler(req, res, next) {
  try {
    const projectPath = projectFrom(req);
    if (!projectPath) throw new ScanError("projectPath wajib diisi", 400);
    const logFile = (req.body && req.body.logFile) || req.query.logFile;
    const snapshot = studio.scan(String(projectPath), logFile ? { logFile: String(logFile) } : {});
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
}

app.get("/api/scan-project", scanHandler);
app.post("/api/scan-project", scanHandler);

app.get("/api/state", (req, res) => {
  const snapshot = studio.snapshot();
  if (!snapshot) {
    res.status(409).json({ detail: "Belum ada proyek yang di-scan" });
    return;
  }
  res.json(snapshot);
});

app.post("/api/status", (req, res, next) => {
  try {
    const { agent, agentId, name, status } = req.body || {};
    const snapshot = studio.setStatus(agent || agentId || name, status);
    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

app.get("/api/events", (req, res) => {
  const projectPath = req.query.projectPath;
  if (projectPath) {
    const current = studio.snapshot();
    if (!current || current.projectPath !== path.resolve(String(projectPath))) {
      try {
        studio.scan(String(projectPath), req.query.logFile ? { logFile: String(req.query.logFile) } : {});
      } catch {
        /* error detail dikirim lewat snapshot bila ada proyek lama */
      }
    }
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const send = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      /* koneksi sudah tertutup */
    }
  };

  const snapshot = studio.snapshot();
  if (snapshot) send("snapshot", snapshot);
  else send("empty", { detail: "Belum ada proyek yang di-scan" });

  const unsubscribe = studio.subscribe((next) => send("snapshot", next));
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

const distDir = path.resolve(__dirname, "../../studio-web/dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(distDir, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ detail: "Endpoint tidak ditemukan" });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const status = error instanceof ScanError ? error.status : 500;
  res.status(status).json({ detail: error.message || "Terjadi kesalahan" });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`OpenCode Studio API listening on http://localhost:${PORT}`);
});

function shutdown() {
  studio.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
