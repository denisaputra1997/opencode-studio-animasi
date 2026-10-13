import Phaser from "phaser";

const WS_URL = "ws://localhost:8000/ws";
const API_URL = "http://localhost:8000/project";
const TILE_W = 120;
const TILE_H = 60;
const DEPTH = 24;
const COLS = 3;
const ORIGIN_Y = 190;

const STATE_COLOR = {
  DEFAULT: 0x3b4a5a,
  WORKING: 0x2ecc71,
  IDLE: 0x95a5a6,
  THINKING: 0x3498db,
  DONE: 0xf1c40f,
  BLOCKED: 0xe74c3c,
};

const STATE_LABEL = {
  WORKING: "WORKING",
  IDLE: "IDLE",
  THINKING: "Berpikir",
  DONE: "Selesai",
  BLOCKED: "Terhambat",
};

const SHIRTS = [
  0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0x1abc9c, 0xe67e22, 0xec407a, 0x5c6bc0,
];

function shirtColor(role) {
  let h = 0;
  for (const ch of role) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return SHIRTS[h % SHIRTS.length];
}

function toPoints(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 2) {
    points.push(new Phaser.Geom.Point(flat[i], flat[i + 1]));
  }
  return points;
}

class Desk extends Phaser.GameObjects.Container {
  constructor(scene, id, label) {
    super(scene, 0, 0);
    this.id = id;
    this.state = "IDLE";
    this.progress = 0;
    this.target = 0;
    this.indeterminate = false;
    this.phase = 0;
    this.timer = null;
    this.strolling = false;
    scene.add.existing(this);

    const shadow = scene.add.graphics();
    shadow.fillStyle(0x000000, 0.22);
    shadow.fillEllipse(0, TILE_H / 2 + DEPTH + 4, TILE_W * 1.15, TILE_H * 0.8);
    this.add(shadow);

    this.char = scene.add.container(0, -22);
    const body = scene.add.graphics();
    body.fillStyle(shirtColor(label), 1);
    body.fillRoundedRect(-13, -28, 26, 34, 9);
    body.fillStyle(0xf2c9a0, 1);
    body.fillCircle(0, -40, 12);
    body.fillStyle(0x2c3e50, 1);
    body.fillCircle(-4, -42, 1.8);
    body.fillCircle(4, -42, 1.8);
    body.fillStyle(0x3e2723, 1);
    body.fillEllipse(0, -50, 26, 12);
    this.char.add(body);
    this.add(this.char);

    const desk = scene.add.graphics();
    desk.fillStyle(0x6d4c41, 1);
    desk.fillPoints(
      toPoints([-TILE_W / 2, 0, 0, TILE_H / 2, 0, TILE_H / 2 + DEPTH, -TILE_W / 2, DEPTH]),
      true
    );
    desk.fillStyle(0x5d4037, 1);
    desk.fillPoints(
      toPoints([TILE_W / 2, 0, 0, TILE_H / 2, 0, TILE_H / 2 + DEPTH, TILE_W / 2, DEPTH]),
      true
    );
    desk.fillStyle(0x8d6e63, 1);
    desk.fillPoints(toPoints([0, -TILE_H / 2, TILE_W / 2, 0, 0, TILE_H / 2, -TILE_W / 2, 0]), true);
    this.add(desk);

    const monitor = scene.add.graphics();
    monitor.fillStyle(0x22303f, 1);
    monitor.fillRoundedRect(-16, -24, 32, 18, 3);
    this.add(monitor);
    this.add(scene.add.rectangle(0, -15, 24, 11, 0x11181f));
    this.screenFill = scene.add.rectangle(-12, -15, 24, 10, STATE_COLOR.IDLE).setOrigin(0, 0.5);
    this.add(this.screenFill);

    this.mug = scene.add.graphics();
    this.mug.fillStyle(0xffffff, 1);
    this.mug.fillRoundedRect(26, -10, 12, 12, 3);
    this.mug.lineStyle(2, 0xffffff, 1);
    this.mug.strokeCircle(40, -4, 4);
    this.add(this.mug);

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, -1, "", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#1b2430",
        align: "center",
        wordWrap: { width: 150 },
      })
      .setOrigin(0.5);
    this.bubble = scene.add.container(0, -122, [this.bubbleBg, this.bubbleText]).setVisible(false);
    this.add(this.bubble);

    this.nameText = scene.add
      .text(0, -74, label, {
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#ecf0f1",
        align: "center",
        wordWrap: { width: TILE_W + 40 },
      })
      .setOrigin(0.5);
    this.statusText = scene.add
      .text(0, TILE_H / 2 + DEPTH + 12, "IDLE", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#95a5a6",
        align: "center",
        wordWrap: { width: TILE_W + 70 },
      })
      .setOrigin(0.5, 0);
    this.add([this.nameText, this.statusText]);

    this.bob = scene.tweens.add({
      targets: this.char,
      y: this.char.y - 3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.workTween = scene.tweens.add({
      targets: this.char,
      angle: 3,
      duration: 110,
      yoyo: true,
      repeat: -1,
      paused: true,
      ease: "Sine.inOut",
    });

    this.appear();
  }

  appear() {
    this.setAlpha(0);
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 300 });
    this.char.x = 180;
    this.scene.tweens.add({ targets: this.char, x: 0, duration: 900, ease: "Cubic.out" });
  }

  setLabel(label) {
    this.nameText.setText(label);
  }

  setTask(task) {
    if (!task) {
      this.bubble.setVisible(false);
      return;
    }
    this.bubbleText.setText(task);
    const w = this.bubbleText.width + 18;
    const h = this.bubbleText.height + 12;
    const bg = this.bubbleBg;
    bg.clear();
    bg.fillStyle(0xf5f7fa, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.fillTriangle(-6, h / 2, 6, h / 2, 0, h / 2 + 8);
    this.bubble.setVisible(true);
  }

  setState(state, task, progress) {
    if (state === "WORKING" && this.state === "WORKING" && typeof progress === "number") {
      return this.setProgress(progress, task);
    }
    switch (state) {
      case "WORKING":
        return this.startWork(task, progress);
      case "THINKING":
        return this.setThinking(task);
      case "BLOCKED":
        return this.setBlocked(task);
      case "DONE":
        return this.setDone(task);
      default:
        return this.setIdle();
    }
  }

  startTicker() {
    if (this.timer) return;
    this.timer = this.scene.time.addEvent({
      delay: 120,
      loop: true,
      callback: () => this.tick(),
    });
  }

  stopTicker() {
    if (this.timer) {
      this.timer.remove();
      this.timer = null;
    }
  }

  startWork(task, progress) {
    this.state = "WORKING";
    this.setTask(task);
    this.applyVisual("WORKING");
    this.bob.timeScale = 2.4;
    this.workTween.resume();
    this.char.setAngle(0);
    this.progress = 0;
    this.setProgress(progress, task);
  }

  setProgress(progress, task) {
    if (task) this.setTask(task);
    this.indeterminate = typeof progress !== "number";
    this.target = this.indeterminate ? 1 : Math.max(0, Math.min(1, progress));
    this.phase = 0;
    this.startTicker();
  }

  setThinking(task) {
    this.state = "THINKING";
    this.setTask(task);
    this.applyVisual("THINKING");
    this.bob.timeScale = 1.4;
    this.workTween.pause();
    this.char.setAngle(0);
    this.progress = 0;
    this.target = 0;
    this.indeterminate = true;
    this.phase = 0;
    this.startTicker();
  }

  setBlocked(task) {
    this.state = "BLOCKED";
    this.setTask(task || "Ada kendala");
    this.stopTicker();
    this.applyVisual("BLOCKED");
    this.bob.timeScale = 1;
    this.workTween.pause();
    this.screenFill.setScale(1, 1);
    this.shake();
  }

  setDone(task) {
    this.state = "DONE";
    if (task) this.setTask(task);
    this.stopTicker();
    this.applyVisual("DONE");
    this.bob.timeScale = 1;
    this.workTween.pause();
    this.screenFill.setScale(1, 1);
    this.celebrate();
    this.scene.time.delayedCall(1400, () => {
      if (this.state === "DONE") this.setIdle();
    });
  }

  applyVisual(state) {
    this.screenFill.setFillStyle(STATE_COLOR[state] ?? STATE_COLOR.DEFAULT);
    this.statusText
      .setColor(`#${(STATE_COLOR[state] ?? STATE_COLOR.IDLE).toString(16).padStart(6, "0")}`)
      .setText(STATE_LABEL[state] ?? state);
    this.mug.setVisible(state === "IDLE");
  }

  tick() {
    if (this.indeterminate) {
      this.phase += 0.14;
      const s = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(this.phase));
      this.screenFill.setScale(s, 1);
      return;
    }
    this.progress += (this.target - this.progress) * 0.25;
    if (this.target - this.progress < 0.005) this.progress = this.target;
    this.screenFill.setScale(this.progress, 1);
  }

  shake() {
    this.scene.tweens.add({
      targets: this.char,
      x: { from: -4, to: 4 },
      duration: 55,
      yoyo: true,
      repeat: 5,
      onComplete: () => this.char.setX(0),
    });
  }

  celebrate() {
    for (let i = 0; i < 6; i++) {
      const spark = this.scene.add.circle(0, -60, 3, 0xf1c40f);
      this.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: Phaser.Math.Between(-42, 42),
        y: Phaser.Math.Between(-112, -50),
        alpha: 0,
        scale: 0,
        duration: 700,
        ease: "Cubic.out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  setIdle() {
    this.state = "IDLE";
    this.setTask(null);
    this.stopTicker();
    this.indeterminate = false;
    this.progress = 0;
    this.target = 0;
    this.applyVisual("IDLE");
    this.screenFill.setScale(0, 1);
    this.bob.timeScale = 1;
    this.workTween.pause();
    this.char.setAngle(0);
  }

  stroll() {
    if (this.state !== "IDLE" || this.strolling || this.char.x !== 0) return;
    this.strolling = true;
    this.bob.pause();
    this.scene.tweens.add({
      targets: this.char,
      x: Phaser.Math.Between(-55, 55),
      y: -22 + Phaser.Math.Between(-14, 14),
      duration: 1600,
      yoyo: true,
      ease: "Sine.inOut",
      onComplete: () => {
        this.char.setPosition(0, -22);
        this.bob.resume();
        this.strolling = false;
      },
    });
  }
}

function drawPlant(scene, x, y) {
  const g = scene.add.graphics();
  g.fillStyle(0x8d6e63, 1);
  g.fillRoundedRect(x - 14, y - 6, 28, 24, 4);
  g.fillStyle(0x2e7d32, 1);
  g.fillEllipse(x - 10, y - 24, 26, 46);
  g.fillEllipse(x + 10, y - 24, 26, 46);
  g.fillStyle(0x43a047, 1);
  g.fillEllipse(x, y - 34, 24, 52);
  return g;
}

function drawClock(scene, x, y) {
  const g = scene.add.graphics();
  g.fillStyle(0xecf0f1, 1);
  g.fillCircle(x, y, 24);
  g.lineStyle(3, 0x34495e, 1);
  g.strokeCircle(x, y, 24);
  g.lineBetween(x, y, x, y - 13);
  g.lineBetween(x, y, x + 10, y + 5);
  g.fillStyle(0x2c3e50, 1);
  g.fillCircle(x, y, 3);
  return g;
}

function drawWhiteboard(scene, x, y) {
  const g = scene.add.graphics();
  g.fillStyle(0xf5f7fa, 1);
  g.fillRoundedRect(x - 70, y - 34, 140, 68, 6);
  g.lineStyle(3, 0x34495e, 1);
  g.strokeRoundedRect(x - 70, y - 34, 140, 68, 6);
  g.lineStyle(3, 0x2ecc71, 1);
  g.lineBetween(x - 54, y - 12, x + 6, y - 12);
  g.lineStyle(3, 0x3498db, 1);
  g.lineBetween(x - 54, y + 4, x + 34, y + 4);
  g.lineStyle(3, 0xe74c3c, 1);
  g.lineBetween(x - 54, y + 20, x - 14, y + 20);
  return g;
}

class StudioScene extends Phaser.Scene {
  constructor() {
    super("studio");
    this.desks = {};
    this.order = [];
  }

  create() {
    this.drawFloor();
    drawWhiteboard(this, this.scale.width / 2 - 300, 118).setDepth(5);
    drawClock(this, this.scale.width / 2 + 300, 118).setDepth(5);
    drawPlant(this, 70, 540).setDepth(5);
    drawPlant(this, this.scale.width - 70, 540).setDepth(5);

    this.add
      .text(this.scale.width / 2, 34, "OpenCode Studio - Animasi", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ecf0f1",
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.addDesk("masteragent", "masteragent");
    this.connect();

    this.time.addEvent({
      delay: 6000,
      loop: true,
      callback: () => this.strollRandom(),
    });
  }

  strollRandom() {
    const idle = Object.values(this.desks).filter((d) => d.state === "IDLE");
    if (idle.length) Phaser.Utils.Array.GetRandom(idle).stroll();
  }

  drawFloor() {
    const cx = this.scale.width / 2;
    const A = { x: cx, y: 140 };
    const B = { x: cx - 330, y: 340 };
    const C = { x: cx + 330, y: 340 };
    const D = { x: cx, y: 540 };
    const g = this.add.graphics();
    g.fillStyle(0x22303f, 1);
    g.fillPoints(toPoints([A.x, A.y, C.x, C.y, D.x, D.y, B.x, B.y]), true);

    const P = (u, v) => ({
      x: A.x + u * (B.x - A.x) + v * (C.x - A.x),
      y: A.y + u * (B.y - A.y) + v * (C.y - A.y),
    });
    const N = 8;
    g.lineStyle(1, 0x2c3e50, 0.9);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = P(t, 0);
      const b = P(t, 1);
      const c = P(0, t);
      const d = P(1, t);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineBetween(c.x, c.y, d.x, d.y);
    }
    g.setDepth(0);
  }

  iso(gx, gy) {
    const cx = this.scale.width / 2;
    return {
      x: cx + (gx - gy) * (TILE_W / 2),
      y: ORIGIN_Y + (gx + gy) * (TILE_H / 2),
    };
  }

  layout() {
    if (this.desks.masteragent) {
      const { x, y } = this.iso(0, 0);
      this.desks.masteragent.setPosition(x, y);
    }

    const n = this.order.length;
    for (let i = 0; i < n; i++) {
      const row = 1 + Math.floor(i / COLS);
      const colsInRow = Math.min(COLS, n - Math.floor(i / COLS) * COLS);
      const gx = row - (colsInRow - 1) / 2 + (i % COLS);
      const { x, y } = this.iso(gx, row);
      this.desks[this.order[i]].setPosition(x, y);
    }
  }

  addDesk(id, label) {
    if (this.desks[id]) {
      if (label) this.desks[id].setLabel(label);
      return this.desks[id];
    }
    const desk = new Desk(this, id, label ?? id);
    this.desks[id] = desk;
    if (id !== "masteragent") this.order.push(id);
    this.layout();
    return desk;
  }

  setAgent(agentId, state, task, role, progress) {
    this.addDesk(agentId, role).setState(state, task, progress);
  }

  connect() {
    const el = document.getElementById("status");
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      if (el) el.textContent = `terhubung: ${WS_URL}`;
    };

    ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      this.setAgent(
        data.agent_id,
        data.state,
        data.task_description,
        data.role,
        data.progress
      );
    };

    ws.onclose = () => {
      if (el) el.textContent = "terputus, mencoba ulang…";
      setTimeout(() => this.connect(), 2000);
    };

    ws.onerror = () => ws.close();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 800,
  height: 600,
  backgroundColor: "#1b2430",
  scene: StudioScene,
});

const form = document.getElementById("prompt-form");
const input = document.getElementById("prompt-input");
const statusEl = document.getElementById("status");

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    statusEl.textContent = "mengirim prompt…";
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      statusEl.textContent = `rencana dibuat: ${data.subtasks.length} sub-tugas`;
      input.value = "";
    } catch (err) {
      statusEl.textContent = `gagal: ${err.message}`;
    }
  });
}
