import Phaser from "phaser";

const WS_URL = "ws://localhost:8000/ws";
const API_URL = "http://localhost:8000/project";
const STOP_URL = "http://localhost:8000/stop";
const PROJECTS_URL = "http://localhost:8000/projects";
const API_HOST = "http://localhost:8000";

// --- Geometri isometrik ---------------------------------------------------
// Satu tile = belah ketupat 64x32. Koordinat grid (c, r) dipetakan ke piksel
// dengan origin (OX, OY) di titik pusat layar, sehingga tidak ada elemen yang
// menumpuk di satu titik.
const TILE_W = 64;
const TILE_H = 32;
const COLS = 19;
const ROWS = 19;
const OX = 640;
const OY = 128;
const WALL_H = 60;
const DESK_TOP = 16;
const DESK_H = 16;

const ROW0_Y = 408;
const ROW1_Y = 546;
const ROW0_CX = 620;
const ROW_GAP = 145;
const ROW1_POOL = [430, 545, 735, 850];
const MASTER_POS = { x: 640, y: 616 };
const SEAT_MASTER = { c: 4.6, r: 5.3 };
const SEAT_GUEST = { c: 1.6, r: 5.3 };
const MEETING_TRAVEL = 900;
const MEETING_HOLD = 1200;

const FLOOR = {
  work: [0x22304a, 0x27364f],
  meeting: [0x322c58, 0x37305f],
  pantry: [0x3b352a, 0x413a2e],
};

const STATE_COLOR = {
  DEFAULT: 0x3b4a5a,
  WORKING: 0x2ecc71,
  IDLE: 0x95a5a6,
  THINKING: 0x3498db,
  DONE: 0xf1c40f,
  BLOCKED: 0xe74c3c,
  MEETING: 0x9b59b6,
};

const STATE_LABEL = {
  WORKING: "WORKING",
  IDLE: "IDLE",
  THINKING: "THINKING",
  DONE: "DONE",
  BLOCKED: "BLOCKED",
  MEETING: "MEETING",
};

const SHIRTS = [
  0xe74c3c, 0x3498db, 0x9b59b6, 0xf1c40f, 0x1abc9c, 0xe67e22, 0xec407a, 0x5c6bc0,
];
const SKIN = [0xf2c9a0, 0xe8b98d, 0xd9a06b, 0xb07a4a, 0x8d5524];
const HAIR = [0x3e2723, 0x212121, 0x5d4037, 0x1c1c1c, 0x4e342e, 0xd4a017, 0x795548];

const DIVISIONS = [
  ["storyboard", "Storyboard Artist"],
  ["designer", "Character Designer"],
  ["animator", "Animator"],
  ["colorist", "Colorist"],
  ["background", "Background Artist"],
  ["compositor", "Compositor"],
  ["editor", "Editor"],
  ["sound", "Sound Designer"],
];

// --- Utilitas -------------------------------------------------------------

const iso = (c, r) => ({
  x: OX + (c - r) * (TILE_W / 2),
  y: OY + (c + r) * (TILE_H / 2),
});

function toPoints(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 2) {
    points.push(new Phaser.Geom.Point(flat[i], flat[i + 1]));
  }
  return points;
}

function zoneAt(c, r) {
  if (c <= 6 && r <= 6) return "meeting";
  if (c >= 14 && r <= 4) return "pantry";
  return "work";
}

function hashStr(str, salt = 0) {
  let h = (salt + 1) * 7919;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 99991;
  return h;
}

function pick(list, str, salt) {
  return list[hashStr(str, salt) % list.length];
}

// Batasi teks panjang supaya tidak meluber menutupi elemen lain.
function truncate(str, max = 26) {
  const s = String(str ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

class Desk extends Phaser.GameObjects.Container {
  constructor(scene, id, label, isMaster = false) {
    super(scene, 0, 0);
    this.id = id;
    this.role = label || id;
    this.isMaster = isMaster;
    this.state = "IDLE";
    this.progress = 0;
    this.target = 0;
    this.indeterminate = false;
    this.phase = 0;
    this.timer = null;
    this.strolling = false;
    this.travelling = false;
    this.homeX = 0;
    this.homeY = 0;
    scene.add.existing(this);

    const accent = isMaster ? 0xf1c40f : 0x3a4a63;

    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.25);
    this.shadow.fillEllipse(0, DESK_TOP + DESK_H + 4, TILE_W * 1.1, TILE_H * 0.9);
    this.add(this.shadow);

    this.char = scene.add.container(0, -16);
    this.drawCharacter(scene, id, isMaster);
    this.add(this.char);

    this.deskGfx = scene.add.graphics();
    this.drawDesk(scene, accent);
    this.add(this.deskGfx);

    this.monitorGfx = scene.add.graphics();
    this.monitorGfx.fillStyle(0x1b2532, 1);
    this.monitorGfx.fillRoundedRect(-15, -34, 30, 20, 3);
    this.monitorGfx.fillStyle(0x0f1620, 1);
    this.monitorGfx.fillRoundedRect(-11, -31, 22, 14, 2);
    this.add(this.monitorGfx);
    this.screenFill = scene.add
      .rectangle(-11, -24, 22, 12, STATE_COLOR.IDLE)
      .setOrigin(0, 0.5);
    this.add(this.screenFill);

    this.mug = scene.add.graphics();
    this.mug.fillStyle(0xecf0f1, 1);
    this.mug.fillRoundedRect(16, -12, 9, 9, 2);
    this.mug.lineStyle(1.5, 0xecf0f1, 1);
    this.mug.strokeCircle(26, -8, 3);
    this.add(this.mug);

    this.cardBg = scene.add.graphics();
    this.add(this.cardBg);
    this.nameText = scene.add
      .text(0, -97, truncate(this.role, 18), {
        fontFamily: "monospace",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#eef3f8",
      })
      .setOrigin(0.5);
    this.statusText = scene.add
      .text(0, -83, "IDLE", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#95a5a6",
      })
      .setOrigin(0.5);
    this.add([this.nameText, this.statusText]);
    this.drawCard(accent);

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, 0, "", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#eef3f8",
        align: "center",
      })
      .setOrigin(0.5);
    this.bubble = scene.add
      .container(0, -134, [this.bubbleBg, this.bubbleText])
      .setVisible(false);
    this.add(this.bubble);

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

    this.setIdle();
    this.appear();
  }

  drawCharacter(scene, id, isMaster) {
    const skin = pick(SKIN, id, 1);
    const hair = pick(HAIR, id, 2);
    const shirt = isMaster ? 0x2c3e50 : pick(SHIRTS, id, 0);
    const g = scene.add.graphics();

    g.fillStyle(shirt, 1);
    g.fillRoundedRect(-11, -36, 22, 34, 8);
    g.fillStyle(0xffffff, 0.92);
    g.fillTriangle(-4, -36, 4, -36, 0, -27);
    g.fillStyle(shirt, 1);
    g.fillRoundedRect(-16, -33, 6, 20, 3);
    g.fillRoundedRect(10, -33, 6, 20, 3);
    g.fillStyle(skin, 1);
    g.fillCircle(-13, -13, 3);
    g.fillCircle(13, -13, 3);
    g.fillCircle(0, -45, 11);
    g.fillCircle(-9.5, -45, 2.4);
    g.fillCircle(9.5, -45, 2.4);
    g.fillStyle(hair, 1);
    g.fillEllipse(0, -53, 22, 10);
    g.fillRoundedRect(-10.5, -54, 21, 8, 3.5);
    g.fillStyle(0x2c3e50, 1);
    g.fillCircle(-3.6, -46, 1.5);
    g.fillCircle(3.6, -46, 1.5);
    g.lineStyle(1.3, 0x8d5524, 1);
    g.beginPath();
    g.arc(0, -40, 3.6, Math.PI * 0.18, Math.PI * 0.82);
    g.strokePath();
    if (isMaster) {
      g.lineStyle(2, 0xf1c40f, 1);
      g.strokeRoundedRect(-11, -36, 22, 34, 8);
    }
    this.char.add(g);
  }

  drawDesk(scene, accent) {
    const g = this.deskGfx;
    g.fillStyle(0x6d4c41, 1);
    g.fillPoints(
      toPoints([-TILE_W / 2, 0, 0, DESK_TOP, 0, DESK_TOP + DESK_H, -TILE_W / 2, DESK_H]),
      true
    );
    g.fillStyle(0x4e342e, 1);
    g.fillPoints(
      toPoints([TILE_W / 2, 0, 0, DESK_TOP, 0, DESK_TOP + DESK_H, TILE_W / 2, DESK_H]),
      true
    );
    g.fillStyle(0x8d6e63, 1);
    g.fillPoints(
      toPoints([0, -DESK_TOP, TILE_W / 2, 0, 0, DESK_TOP, -TILE_W / 2, 0]),
      true
    );
    g.lineStyle(2, accent, 0.9);
    g.strokePoints(
      toPoints([0, -DESK_TOP, TILE_W / 2, 0, 0, DESK_TOP, -TILE_W / 2, 0]),
      true,
      true
    );
  }

  drawCard(accent) {
    const w = Math.max(this.nameText.width, 54) + 16;
    const h = 30;
    this.cardBg.clear();
    this.cardBg.fillStyle(0x0d1522, 0.9);
    this.cardBg.fillRoundedRect(-w / 2, -108, w, h, 5);
    this.cardBg.lineStyle(1.2, accent, 0.95);
    this.cardBg.strokeRoundedRect(-w / 2, -108, w, h, 5);
  }

  setPosition(x, y) {
    this.homeX = x;
    this.homeY = y;
    if (!this.travelling) super.setPosition(x, y);
    return this;
  }

  setFurnitureVisible(visible) {
    for (const part of [
      this.shadow,
      this.deskGfx,
      this.monitorGfx,
      this.screenFill,
      this.mug,
    ]) {
      if (part) part.setVisible(visible);
    }
  }

  travel(c, r, duration = MEETING_TRAVEL) {
    const target = iso(c, r);
    this.travelling = true;
    this.setFurnitureVisible(false);
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: target.x,
        y: target.y,
        duration,
        ease: "Sine.inOut",
        onUpdate: () => this.setDepth(this.y + 2),
        onComplete: () => {
          this.setDepth(this.y + 2);
          resolve();
        },
      });
    });
  }

  goHome(duration = MEETING_TRAVEL) {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this,
        x: this.homeX,
        y: this.homeY,
        duration,
        ease: "Sine.inOut",
        onUpdate: () => this.setDepth(this.y),
        onComplete: () => {
          this.setDepth(this.homeY);
          this.setFurnitureVisible(true);
          this.travelling = false;
          resolve();
        },
      });
    });
  }

  appear() {
    this.setAlpha(0);
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 300 });
    this.char.x = 90;
    this.scene.tweens.add({ targets: this.char, x: 0, duration: 900, ease: "Cubic.out" });
  }

  setLabel(label) {
    this.role = label;
    this.nameText.setText(truncate(label, 18));
    this.drawCard(this.isMaster ? 0xf1c40f : 0x3a4a63);
  }

  setTask(task) {
    if (!task) {
      this.bubble.setVisible(false);
      return;
    }
    this.bubbleText.setText(truncate(task, 26));
    const w = this.bubbleText.width + 18;
    const h = this.bubbleText.height + 12;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0x1b2430, 0.95);
    this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    this.bubbleBg.lineStyle(1, 0x5b7ba8, 0.6);
    this.bubbleBg.fillTriangle(-5, h / 2, 5, h / 2, 0, h / 2 + 7);
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
      case "MEETING":
        return this.setMeeting(task);
      case "BLOCKED":
        return this.setBlocked(task);
      case "DONE":
        return this.setDone(task);
      case "SPAWNED":
        this.appear();
        return this.setIdle();
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

  setMeeting(task) {
    this.state = "MEETING";
    this.setTask(task);
    this.applyVisual("MEETING");
    this.stopTicker();
    this.bob.timeScale = 1.6;
    this.workTween.pause();
    this.char.setAngle(0);
    this.progress = 0;
    this.target = 0;
    this.indeterminate = false;
    this.screenFill.setScale(1, 1);
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
    const color = STATE_COLOR[state] ?? STATE_COLOR.DEFAULT;
    this.screenFill.setFillStyle(color);
    this.statusText
      .setColor(`#${color.toString(16).padStart(6, "0")}`)
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
      x: Phaser.Math.Between(-45, 45),
      y: -16 + Phaser.Math.Between(-6, 6),
      duration: 1600,
      yoyo: true,
      ease: "Sine.inOut",
      onComplete: () => {
        this.char.setPosition(0, -16);
        this.bob.resume();
        this.strolling = false;
      },
    });
  }
}

// --- Dekorasi -------------------------------------------------------------

function drawPlant(scene, x, y) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x, y, 34, 12);
  g.fillStyle(0x8d6e63, 1);
  g.fillPoints(toPoints([x, y - 8, x + 12, y - 2, x, y + 8, x - 12, y - 2]), true);
  g.fillStyle(0x6d4c41, 1);
  g.fillPoints(toPoints([x - 12, y - 2, x, y + 8, x, y + 14, x - 12, y + 4]), true);
  g.fillPoints(toPoints([x + 12, y - 2, x, y + 8, x, y + 14, x + 12, y + 4]), true);
  g.fillStyle(0x2e7d32, 1);
  g.fillEllipse(x - 8, y - 28, 22, 40);
  g.fillEllipse(x + 8, y - 28, 22, 40);
  g.fillStyle(0x43a047, 1);
  g.fillEllipse(x, y - 38, 20, 46);
  g.setDepth(y);
  return g;
}

// Jam digital 7-segmen yang menempel di bidang dinding kanan (r tetap = -0.5).
// Bidang dinding dimiringkan: sumbu-a sepanjang dinding turun +0.5 px/px, sumbu-b ke atas.
function drawWallClock(scene, base) {
  const W = (a, b) => ({ x: base.x + a, y: base.y + a * 0.5 - b });
  const quad = (x0, b0, x1, b1) => {
    const p = [W(x0, b0), W(x1, b0), W(x1, b1), W(x0, b1)];
    return toPoints([p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y]);
  };

  const w = 132;
  const h = 40;
  const cb = 30;

  const frame = scene.add.graphics().setDepth(-89);
  frame.fillStyle(0x05090d, 0.5);
  frame.fillPoints(quad(-w / 2 + 4, cb - h / 2 - 4, w / 2 + 4, cb + h / 2 - 4), true);
  frame.fillStyle(0x0b1119, 0.97);
  frame.fillPoints(quad(-w / 2, cb - h / 2, w / 2, cb + h / 2), true);
  frame.lineStyle(3, 0x34495e, 1);
  frame.strokePoints(quad(-w / 2, cb - h / 2, w / 2, cb + h / 2), true, true);
  frame.lineStyle(1, 0x00e5ff, 0.22);
  frame.strokePoints(quad(-w / 2 + 4, cb - h / 2 + 4, w / 2 - 4, cb + h / 2 - 4), true, true);

  const digits = scene.add.graphics().setDepth(-88);
  const SEG = {
    0: "abcdef",
    1: "bc",
    2: "abged",
    3: "abgcd",
    4: "fgbc",
    5: "afgcd",
    6: "afgecd",
    7: "abc",
    8: "abcdefg",
    9: "abcdfg",
  };
  const dw = 12;
  const dh = 22;
  const t = 3;
  const gap = 4;
  const top = cb + dh / 2;
  const bottom = cb - dh / 2;
  const half = t / 2;

  const segBox = (letter, ax) => {
    switch (letter) {
      case "a":
        return [ax, top - t, ax + dw, top];
      case "b":
        return [ax + dw - t, cb, ax + dw, top];
      case "c":
        return [ax + dw - t, bottom, ax + dw, cb];
      case "d":
        return [ax, bottom, ax + dw, bottom + t];
      case "e":
        return [ax, bottom, ax + t, cb];
      case "f":
        return [ax, cb, ax + t, top];
      case "g":
        return [ax + t, cb - half, ax + dw - t, cb + half];
    }
    return null;
  };

  const paint = (box, on) => {
    const hot = on ? 0xffb347 : 0x3a2c17;
    digits.fillStyle(hot, on ? 1 : 0.5);
    digits.fillPoints(quad(box[0], box[1], box[2], box[3]), true);
  };

  const drawDigit = (char, ax) => {
    const segs = SEG[char] || "";
    for (const letter of "abcdefg") {
      const box = segBox(letter, ax);
      if (box) paint(box, segs.includes(letter));
    }
  };

  const drawColon = (ax, on) => {
    paint([ax, cb + 2, ax + t, cb + 2 + t], on);
    paint([ax, cb - 2 - t, ax + t, cb - 2], on);
  };

  const widths = { d: dw, c: 6 };
  const layout = ["d", "d", "c", "d", "d", "c", "d", "d"];
  const totalWidth = layout.reduce((s, k, i) => s + widths[k] + (i ? gap : 0), 0);

  const render = () => {
    const now = new Date();
    const parts = [
      ...String(now.getHours()).padStart(2, "0"),
      ":",
      ...String(now.getMinutes()).padStart(2, "0"),
      ":",
      ...String(now.getSeconds()).padStart(2, "0"),
    ];
    const blink = Math.floor(now.getMilliseconds() / 500) === 0;
    let ax = -totalWidth / 2;
    digits.clear();
    layout.forEach((kind, i) => {
      if (kind === "c") drawColon(ax, blink);
      else drawDigit(parts[i], ax);
      ax += widths[kind] + gap;
    });
  };

  render();
  scene.time.addEvent({ delay: 250, loop: true, callback: render });
  return digits;
}

// --- Scene ----------------------------------------------------------------

class StudioScene extends Phaser.Scene {
  constructor() {
    super("studio");
    this.desks = {};
    this.order = [];
    this.meetings = [];
    this.meetingActive = false;
  }

  create() {
    this.drawWalls();
    this.drawFloor();
    this.drawMeetingRoom();
    this.drawPantry();
    this.drawDecor();
    this.drawTitles();

    this.addDesk("masteragent", "masteragent", true);
    for (const [id, role] of DIVISIONS) this.addDesk(id, role);
    this.connect();

    this.time.addEvent({
      delay: 6000,
      loop: true,
      callback: () => this.strollRandom(),
    });
  }

  // Dinding belakang (dua sisi) + dekorasi dinding.
  drawWalls() {
    const g = this.add.graphics().setDepth(-100);
    const top = iso(-0.5, -0.5);
    const leftEnd = iso(-0.5, ROWS - 0.5);
    const rightEnd = iso(COLS - 0.5, -0.5);

    const left = toPoints([
      top.x, top.y, leftEnd.x, leftEnd.y,
      leftEnd.x, leftEnd.y - WALL_H, top.x, top.y - WALL_H,
    ]);
    const right = toPoints([
      top.x, top.y, rightEnd.x, rightEnd.y,
      rightEnd.x, rightEnd.y - WALL_H, top.x, top.y - WALL_H,
    ]);
    g.fillStyle(0x1b2637, 1);
    g.fillPoints(left, true);
    g.fillStyle(0x212e42, 1);
    g.fillPoints(right, true);
    g.lineStyle(2, 0x36506f, 0.9);
    g.strokePoints(left, true, true);
    g.strokePoints(right, true, true);
    g.lineStyle(2, 0x36506f, 0.55);
    for (let i = 3; i < COLS; i += 3) {
      const a = iso(-0.5, i - 0.5);
      g.lineBetween(a.x, a.y, a.x, a.y - WALL_H);
      const b = iso(i - 0.5, -0.5);
      g.lineBetween(b.x, b.y, b.x, b.y - WALL_H);
    }
  }

  drawFloor() {
    const g = this.add.graphics().setDepth(0);
    const inset = 1.5;
    const hw = TILE_W / 2 - inset;
    const hh = TILE_H / 2 - inset / 2;
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const p = iso(c, r);
        const pal = FLOOR[zoneAt(c, r)];
        g.fillStyle(pal[(c + r) % 2], 1);
        g.fillPoints(
          toPoints([p.x, p.y - hh, p.x + hw, p.y, p.x, p.y + hh, p.x - hw, p.y]),
          true
        );
      }
    }
    this.strokeZone(g, 0, 0, 6, 6, 0x6c5ce7);
    this.strokeZone(g, 14, 0, 18, 4, 0xc9a227);
  }

  strokeZone(g, c0, r0, c1, r1, color) {
    const a = iso(c0 - 0.5, r0 - 0.5);
    const b = iso(c1 + 0.5, r0 - 0.5);
    const c = iso(c1 + 0.5, r1 + 0.5);
    const d = iso(c0 - 0.5, r1 + 0.5);
    g.lineStyle(2, color, 0.85);
    g.strokePoints(toPoints([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]), true, true);
  }

  // Panel di dinding belakang kiri (bidang c tetap).
  drawWallPanel(c, r0, r1, h0, h1, fill, stroke) {
    const p0 = iso(c, r0);
    const p1 = iso(c, r1);
    const g = this.add.graphics().setDepth(-95);
    const quad = toPoints([
      p0.x, p0.y - h0, p1.x, p1.y - h0,
      p1.x, p1.y - h1, p0.x, p0.y - h1,
    ]);
    g.fillStyle(fill, 1);
    g.fillPoints(quad, true);
    g.lineStyle(2, stroke, 1);
    g.strokePoints(quad, true, true);
    return { g, p0, p1 };
  }

  drawMeetingRoom() {
    // Meja panjang
    const c0 = 0.6;
    const c1 = 5.6;
    const r0 = 1.5;
    const r1 = 4.5;
    const table = this.add.graphics().setDepth(216);
    const A = iso(c0, r0);
    const B = iso(c1, r0);
    const C = iso(c1, r1);
    const D = iso(c0, r1);
    table.fillStyle(0x4e342e, 1);
    table.fillPoints(toPoints([D.x, D.y, C.x, C.y, C.x, C.y + 14, D.x, D.y + 14]), true);
    table.fillPoints(toPoints([B.x, B.y, C.x, C.y, C.x, C.y + 14, B.x, B.y + 14]), true);
    table.fillStyle(0x8d6e63, 1);
    table.fillPoints(toPoints([A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y]), true);
    table.lineStyle(2, 0xa1887f, 1);
    table.strokePoints(toPoints([A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y]), true, true);

    // Kursi
    for (const spec of [
      [1.6, 0.7], [3.1, 0.7], [4.6, 0.7],
      [1.6, 5.3], [3.1, 5.3], [4.6, 5.3],
    ]) {
      const p = iso(spec[0], spec[1]);
      const ch = this.add.graphics();
      ch.fillStyle(0x000000, 0.22);
      ch.fillEllipse(p.x, p.y + 4, 26, 10);
      ch.fillStyle(0x546e7a, 1);
      ch.fillPoints(
        toPoints([p.x, p.y - 6, p.x + 11, p.y - 1, p.x, p.y + 4, p.x - 11, p.y - 1]),
        true
      );
      ch.fillStyle(0x455a64, 1);
      ch.fillPoints(
        toPoints([p.x - 11, p.y - 1, p.x, p.y + 4, p.x, p.y + 12, p.x - 11, p.y + 7]),
        true
      );
      ch.fillPoints(
        toPoints([p.x + 11, p.y - 1, p.x, p.y + 4, p.x, p.y + 12, p.x + 11, p.y + 7]),
        true
      );
      ch.fillStyle(0x78909c, 1);
      ch.fillRoundedRect(p.x - 10, p.y - 20, 20, 16, 4);
      ch.setDepth(p.y - 1);
    }

    // Layar/papan presentasi di dinding belakang kiri
    this.drawWallPanel(-0.5, 1.4, 4.6, 10, 52, 0x22303f, 0x3a4a63);
    const s0 = iso(-0.5, 1.7);
    const s1 = iso(-0.5, 4.3);
    const sg = this.add.graphics().setDepth(-94);
    sg.fillStyle(0x0f1a26, 1);
    sg.fillPoints(
      toPoints([
        s0.x, s0.y - 15, s1.x, s1.y - 15, s1.x, s1.y - 47, s0.x, s0.y - 47,
      ]),
      true
    );
    const bars = [
      [0x2ecc71, 0.15, 0.5],
      [0x3498db, 0.42, 0.75],
      [0xf1c40f, 0.7, 0.62],
    ];
    for (const [col, t] of bars) {
      const ax = s0.x + (s1.x - s0.x) * t;
      const ay = s0.y + (s1.y - s0.y) * t - 15;
      sg.fillStyle(col, 0.95);
      sg.fillRect(ax - 4, ay - 20, 8, 20);
    }
    sg.lineStyle(1.5, 0x4f6b8a, 0.9);
    sg.lineBetween(s0.x, s0.y - 15, s1.x, s1.y - 15);

    // Label area meeting
    const lab = iso(2.6, 6.2);
    this.add
      .text(lab.x, lab.y, "RUANG MEETING", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#c39bd3",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawPantry() {
    const g = this.add.graphics().setDepth(400);
    const P = (c, r) => iso(c, r);
    // Meja pantry panjang di sepanjang dinding kanan-belakang
    const A = P(13, 0.1);
    const B = P(15.8, 0.1);
    const C = P(15.8, 1.2);
    const D = P(13, 1.2);
    const H = 24;
    g.fillStyle(0x3e2f28, 1);
    g.fillPoints(toPoints([D.x, D.y, C.x, C.y, C.x, C.y + H, D.x, D.y + H]), true);
    g.fillPoints(toPoints([B.x, B.y, C.x, C.y, C.x, C.y + H, B.x, B.y + H]), true);
    g.fillStyle(0x6d4c41, 1);
    g.fillPoints(toPoints([A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y]), true);
    g.fillStyle(0x8d6e63, 1);
    g.fillPoints(
      toPoints([
        A.x, A.y - 4, B.x, B.y - 4, C.x, C.y - 4, D.x, D.y - 4,
      ]),
      true
    );

    // Mesin kopi
    const mc = P(13.9, 0.6);
    g.fillStyle(0x37474f, 1);
    g.fillRect(mc.x - 9, mc.y - 24, 18, 22);
    g.fillStyle(0x90a4ae, 1);
    g.fillRect(mc.x - 7, mc.y - 22, 14, 6);
    g.fillStyle(0xe74c3c, 1);
    g.fillCircle(mc.x - 4, mc.y - 8, 1.6);
    g.fillStyle(0x2ecc71, 1);
    g.fillCircle(mc.x + 1, mc.y - 8, 1.6);

    // Wastafel/sink
    const sk = P(15.1, 0.6);
    g.fillStyle(0xb0bec5, 1);
    g.fillEllipse(sk.x, sk.y - 5, 22, 11);
    g.fillStyle(0x546e7a, 1);
    g.fillEllipse(sk.x, sk.y - 5, 16, 7);
    g.lineStyle(2, 0xcfd8dc, 1);
    g.lineBetween(sk.x, sk.y - 5, sk.x, sk.y - 18);
    g.lineBetween(sk.x, sk.y - 18, sk.x + 6, sk.y - 18);

    // Kulkas
    const fr = P(13.4, 2.4);
    const fg = this.add.graphics().setDepth(406);
    fg.fillStyle(0x000000, 0.22);
    fg.fillEllipse(fr.x, fr.y + 6, 34, 12);
    fg.fillStyle(0x455a64, 1);
    fg.fillPoints(
      toPoints([fr.x - 16, fr.y - 12, fr.x, fr.y - 4, fr.x, fr.y + 6, fr.x - 16, fr.y - 2]),
      true
    );
    fg.fillStyle(0x546e7a, 1);
    fg.fillPoints(
      toPoints([fr.x + 16, fr.y - 12, fr.x, fr.y - 4, fr.x, fr.y + 6, fr.x + 16, fr.y - 2]),
      true
    );
    fg.fillStyle(0x78909c, 1);
    fg.fillPoints(
      toPoints([fr.x, fr.y - 20, fr.x + 16, fr.y - 12, fr.x, fr.y - 4, fr.x - 16, fr.y - 12]),
      true
    );
    fg.fillStyle(0x90a4ae, 1);
    fg.fillRect(fr.x - 1, fr.y - 34, 3, 14);

    const lab = iso(14.5, 4.4);
    this.add
      .text(lab.x, lab.y, "PANTRY", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e0b860",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawDecor() {
    drawWallClock(this, iso(6.5, -0.5));
    drawPlant(this, iso(0, 0).x, iso(0, 0).y + 2);
    drawPlant(this, iso(0, 18).x + 6, iso(0, 18).y);
    drawPlant(this, iso(4, 18).x, iso(4, 18).y);
    drawPlant(this, iso(16.5, 4).x, iso(16.5, 4).y);
  }

  drawTitles() {
    this.add
      .text(OX, 30, "OpenCode Studio — Kantor Animasi", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#ecf0f1",
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  strollRandom() {
    const idle = Object.values(this.desks).filter((d) => d.state === "IDLE");
    if (idle.length) Phaser.Utils.Array.GetRandom(idle).stroll();
  }

  addDesk(id, label, isMaster = undefined) {
    if (this.desks[id]) {
      if (label) this.desks[id].setLabel(label);
      return this.desks[id];
    }
    const master = isMaster ?? id === "masteragent";
    const desk = new Desk(this, id, label ?? id, master);
    this.desks[id] = desk;
    if (!master) this.order.push(id);
    this.layout();
    return desk;
  }

  layout() {
    const master = this.desks.masteragent;
    if (master) {
      master.setPosition(MASTER_POS.x, MASTER_POS.y);
      if (!master.travelling) master.setDepth(MASTER_POS.y);
    }

    const ids = this.order;
    const n = ids.length;
    if (!n) return;
    let row0Count = Math.min(5, n);
    let row1Count = Math.min(ROW1_POOL.length, n - row0Count);
    if (row0Count + row1Count < n) row0Count = n - row1Count;

    for (let i = 0; i < n; i++) {
      let x;
      let y;
      if (i < row0Count) {
        y = ROW0_Y;
        x = ROW0_CX + (i - (row0Count - 1) / 2) * ROW_GAP;
      } else {
        y = ROW1_Y;
        x = ROW1_POOL[i - row0Count];
      }
      const desk = this.desks[ids[i]];
      desk.setPosition(x, y);
      if (!desk.travelling) desk.setDepth(y);
    }
  }

  wait(ms) {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  startMeeting(agentId, task) {
    if (!agentId || agentId === "masteragent") return;
    this.meetings.push({ agentId, task });
    this.pumpMeetings();
  }

  async pumpMeetings() {
    if (this.meetingActive) return;
    const job = this.meetings.shift();
    if (!job) return;
    this.meetingActive = true;

    const master = this.desks.masteragent;
    const guest = this.addDesk(job.agentId);
    master.setTask(job.task || "Menyerahkan tugas…");
    guest.setTask("Menerima tugas dari masteragent");

    await Promise.all([
      master.travel(SEAT_MASTER.c, SEAT_MASTER.r),
      guest.travel(SEAT_GUEST.c, SEAT_GUEST.r),
    ]);
    await this.wait(MEETING_HOLD);
    master.setTask(null);
    guest.setTask(null);
    await Promise.all([master.goHome(), guest.goHome()]);

    this.meetingActive = false;
    this.pumpMeetings();
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
      if (data.type === "meeting") {
        if (data.phase === "start") {
          const participants = data.participants || [];
          const guest = participants.find((a) => a !== "masteragent") || data.agent_id;
          this.startMeeting(guest, data.task);
        }
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

// --- Bootstrap ------------------------------------------------------------

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 800,
  backgroundColor: "#121a26",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: StudioScene,
});

const form = document.getElementById("prompt-form");
const input = document.getElementById("prompt-input");
const statusEl = document.getElementById("status");
const stopBtn = document.getElementById("stop-btn");
const outputEl = document.getElementById("output");

function watchProject(slug) {
  const started = Date.now();
  const tick = async () => {
    try {
      const res = await fetch(PROJECTS_URL);
      const data = await res.json();
      const project = (data.projects || []).find((p) => p.slug === slug);
      if (project) {
        const files = (project.files || []).map((f) => `<li>${f}</li>`).join("");
        outputEl.style.display = "block";
        if (project.animation) {
          const url = `${API_HOST}/${project.animation}`;
          outputEl.innerHTML =
            `Proyek <b>${project.slug}</b><br>` +
            `<a href="${url}" target="_blank">▶ Putar animasi</a>` +
            `<ul>${files}</ul>`;
          statusEl.textContent = `animasi siap: ${project.animation}`;
          return;
        }
        outputEl.innerHTML = `Proyek <b>${project.slug}</b><br>menyusun animasi…<ul>${files}</ul>`;
      }
    } catch {
      /* abaikan, coba lagi */
    }
    if (Date.now() - started < 180000) setTimeout(tick, 2500);
  };
  tick();
}

if (stopBtn) {
  stopBtn.addEventListener("click", async () => {
    statusEl.textContent = "menghentikan aktivitas…";
    try {
      const res = await fetch(STOP_URL, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      statusEl.textContent = `dihentikan: ${data.stopped.length} agent`;
    } catch (err) {
      statusEl.textContent = `gagal: ${err.message}`;
    }
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;

    statusEl.textContent = "mengirim prompt…";
    if (outputEl) outputEl.style.display = "none";
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      statusEl.textContent = `rencana dibuat: ${data.subtasks.length} sub-tugas → ${data.project}/`;
      input.value = "";
      watchProject(data.project.split("/").pop());
    } catch (err) {
      statusEl.textContent = `gagal: ${err.message}`;
    }
  });
}
