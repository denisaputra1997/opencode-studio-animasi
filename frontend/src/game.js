import Phaser from "phaser";

const WS_URL = "ws://localhost:8000/ws";
const API_URL = "http://localhost:8000/project";
const STOP_URL = "http://localhost:8000/stop";
const PROJECTS_URL = "http://localhost:8000/projects";
const PROJECT_FOLDERS_URL = "http://localhost:8000/projects/folders";
const PROJECT_AGENTS_URL = "http://localhost:8000/projects";
const SCAN_AGENTS_URL = "http://localhost:8000/agents/scan";
const SCAN_DEFAULT_URL = "http://localhost:8000/agents/scan/default";
const BROWSE_DIRS_URL = "http://localhost:8000/agents/scan/browse";
const API_HOST = "http://localhost:8000";

// --- Geometri isometrik ---------------------------------------------------
// Satu tile = belah ketupat 64x32. Koordinat grid (c, r) dipetakan ke piksel
// dengan origin (OX, OY), sehingga ruangan bisa digeser seperti peta.
const TILE_W = 64;
const TILE_H = 32;
const COLS = 34;
const ROWS = 24;
const OX = 920;
const OY = 104;
const WALL_H = 78;
const DEFAULT_ZOOM = 1.15;

// Dimensi meja kerja (diamond isometrik) dalam piksel.
const DESK_W = 68;
const DESK_D = 34;
const DESK_H = 26;
const CHAR_Y = -DESK_H - 8;

// Tata letak ruang kerja: grid meja berjarak tetap (3.2 tile = 102px) sehingga
// monitor, kursi, dan kartu nama tidak saling menutupi. Meja dikelompokkan
// 2x2 menjadi "kubikel" hanya lewat warna karpet pod.
const DESK_C0 = 7;
const DESK_R0 = 7.5;
const DESK_STEP = 3.2;
const DESK_COLS = 7;
const DESK_ROWS = 5;
const MASTER_SLOT = { c: DESK_C0 + DESK_STEP * 3, r: DESK_R0 + DESK_STEP };

const PODS = [];
for (let b = 0; b < DESK_ROWS; b += 2) {
  for (let a = 0; a < DESK_COLS; a += 2) {
    PODS.push([DESK_C0 + a * DESK_STEP, DESK_R0 + b * DESK_STEP]);
  }
}

const SEAT_MASTER = { c: 2.2, r: 5.7 };
const SEAT_GUEST = { c: 3.6, r: 5.7 };
const MEETING_TRAVEL = 900;
const MEETING_HOLD = 1200;

// Batas panel partisi pada baris pod terakhir: berhenti sebelum koridor depan
// agar jalan utama tetap terbuka (dan bisa dilalui).
const FRONT_CORRIDOR_R = 21.4;

// --- NPC & Prototype kantor ------------------------------------------------
// Pintu masuk di tepi depan, dekat resepsionis.
const ENTRANCE = { c: 4.3, r: 23.2 };
const RECEPTION_STATION = { c: 2.0, r: 19.9 };
const RECEPTION_FRONT = { c: 2.2, r: 22.1 };
const PANTRY_SPOT = { c: 28.2, r: 4.7 };
const PANTRY_COFFEE = { c: 29.0, r: 2.1 };

// Titik yang sering didatangi office boy saat membersihkan.
const CLEAN_SPOTS = [
  { c: 8.0, r: 22.2 }, { c: 11.2, r: 22.4 }, { c: 14.4, r: 22.5 },
  { c: 17.6, r: 22.6 }, { c: 20.8, r: 22.7 }, { c: 24.0, r: 22.8 },
  { c: 26.6, r: 18.6 }, { c: 26.8, r: 14.4 }, { c: 26.9, r: 10.2 },
  { c: 26.4, r: 6.4 }, { c: 5.6, r: 21.4 }, { c: 5.4, r: 6.2 },
];

// Istirahat punya tujuan tetap: ngopi di pantri atau ngobrol berdua di lounge.
const COFFEE_SPOT = { c: 29.0, r: 2.1 };
const CHAT_SEATS = [
  { c: 29.9, r: 21.8 },
  { c: 31.5, r: 19.6 },
];

// Baru boleh istirahat setelah menganggur beberapa menit tanpa pekerjaan.
const BREAK_AFTER_MIN = 180000;
const BREAK_AFTER_MAX = 360000;
const BREAK_SPACING_MIN = 180000;
const BREAK_SPACING_MAX = 300000;
const COFFEE_BREAK_MIN = 6000;
const COFFEE_BREAK_MAX = 12000;
const CHAT_BREAK_MIN = 14000;
const CHAT_BREAK_MAX = 24000;
const CHAT_CHANCE = 0.35;
const MAX_AWAY = 2;

// Langkah dibuat lebih pelan dan mengalir (durasi dasar dikali skala ini).
const WALK_TIME_SCALE = 1.5;

// Resepsionis hanya sesekali meninggalkan meja.
const RECEPTION_IDLE_MIN = 35000;
const RECEPTION_IDLE_MAX = 65000;
const RECEPTION_BREAK_CHANCE = 0.25;
const RECEPTION_BREAK_HOLD_MIN = 4000;
const RECEPTION_BREAK_HOLD_MAX = 7000;

const GUEST_FIRST = 18000;
const GUEST_INTERVAL_MIN = 45000;
const GUEST_INTERVAL_MAX = 90000;

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

// --- Utilitas -------------------------------------------------------------

const iso = (c, r) => ({
  x: OX + (c - r) * (TILE_W / 2),
  y: OY + (c + r) * (TILE_H / 2),
});

// Sumbu dua arah pada bidang datar isometrik (satu tile = 1 satuan).
const AX = { x: TILE_W / 2, y: TILE_H / 2 };
const BX = { x: -TILE_W / 2, y: TILE_H / 2 };

function toPoints(flat) {
  const points = [];
  for (let i = 0; i < flat.length; i += 2) {
    points.push(new Phaser.Geom.Point(flat[i], flat[i + 1]));
  }
  return points;
}

function fillQuad(g, p) {
  g.fillPoints(toPoints([p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y]), true);
}

function strokeQuad(g, p, width = 2, alpha = 1, color = 0xffffff) {
  g.lineStyle(width, color, alpha);
  g.strokePoints(
    toPoints([p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y]),
    true,
    true
  );
}

// Persegi panjang yang lieflat di bidang isometrik (lantai / permukaan meja).
function planeQuad(cx, cy, dc, dr) {
  const p = (u, v) => ({
    x: cx + AX.x * u + BX.x * v,
    y: cy + AX.y * u + BX.y * v,
  });
  return [p(-dc / 2, -dr / 2), p(dc / 2, -dr / 2), p(dc / 2, dr / 2), p(-dc / 2, dr / 2)];
}

// Kotak iso: alas (c,r) berukuran dc x dr tile, setinggi h piksel.
function isoBox(g, c, r, dc, dr, h, top, right, left) {
  const a = iso(c, r);
  const b = iso(c + dc, r);
  const d = iso(c + dc, r + dr);
  const e = iso(c, r + dr);
  g.fillStyle(left, 1);
  fillQuad(g, [d, e, { x: e.x, y: e.y - h }, { x: d.x, y: d.y - h }]);
  g.fillStyle(right, 1);
  fillQuad(g, [b, d, { x: d.x, y: d.y - h }, { x: b.x, y: b.y - h }]);
  g.fillStyle(top, 1);
  fillQuad(g, [
    { x: a.x, y: a.y - h },
    { x: b.x, y: b.y - h },
    { x: d.x, y: d.y - h },
    { x: e.x, y: e.y - h },
  ]);
}

function zoneAt(c, r) {
  if (c <= 7 && r <= 6) return "meeting";
  if (c >= 27 && r <= 5) return "pantry";
  if (c <= 4 && r >= 9 && r <= 16) return "server";
  if (c >= 28 && r >= 18) return "lounge";
  if (c <= 6 && r >= 20) return "reception";
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

// --- Navigasi: peta jalan + pencarian jalur A* -----------------------------
// Semua orang (NPC & karyawan) berjalan mengikuti jalur yang menghindari tembok,
// partisi kubikel, dan perabot; tidak pernah menembus objek.

const NAV_MARGIN = 0.2;    // toleransi tepi objek
const NAV_WALL_HALF = 0.16; // setengah lebar panel partisi
const NAV_CLEARANCE = 0.34; // jarak aman dari tepi objek
const NAV_SKIN = 0.01;     // toleransi numerik uji jarak

// Koordinat grid (c, r) dari posisi piksel.
function gridOf(x, y) {
  const dx = (x - OX) / (TILE_W / 2);
  const dy = (y - OY) / (TILE_H / 2);
  return { c: (dx + dy) / 2, r: (dy - dx) / 2 };
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

// Jarak minimum antara dua segmen (bujur/lurus).
function segSegDist(p0, p1, q0, q1) {
  const d1x = p1.c - p0.c;
  const d1r = p1.r - p0.r;
  const d2x = q1.c - q0.c;
  const d2r = q1.r - q0.r;
  const rx = p0.c - q0.c;
  const ry = p0.r - q0.r;
  const a = d1x * d1x + d1r * d1r;
  const e = d2x * d2x + d2r * d2r;
  const f = d2x * rx + d2r * ry;
  const EPS = 1e-9;
  let s;
  let t;
  if (a <= EPS && e <= EPS) return Math.hypot(rx, ry);
  if (a <= EPS) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1r * ry;
    if (e <= EPS) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1r * d2r;
      const denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  const dx = p0.c + d1x * s - (q0.c + d2x * t);
  const dy = p0.r + d1r * s - (q0.r + d2r * t);
  return Math.hypot(dx, dy);
}

// Jarak minimum antara segmen dan persegi panjang (0 bila berpotongan).
function segRectDist(p0, p1, c0, r0, c1, r1) {
  let t0 = 0;
  let t1 = 1;
  const dc = p1.c - p0.c;
  const dr = p1.r - p0.r;
  const clip = (p, q, lo, hi) => {
    if (Math.abs(p) < 1e-9) return q >= lo && q <= hi;
    let ta = (lo - q) / p;
    let tb = (hi - q) / p;
    if (ta > tb) {
      const tmp = ta;
      ta = tb;
      tb = tmp;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  if (clip(dc, p0.c, c0, c1) && clip(dr, p0.r, r0, r1)) return 0;

  // Tidak berpotongan: jarak terdekat ke sudut/ujung.
  const pointRectDist = (p) => {
    const dx = Math.max(c0 - p.c, 0, p.c - c1);
    const dy = Math.max(r0 - p.r, 0, p.r - r1);
    return Math.hypot(dx, dy);
  };
  const corners = [
    { c: c0, r: r0 },
    { c: c1, r: r0 },
    { c: c0, r: r1 },
    { c: c1, r: r1 },
  ];
  let best = Math.min(pointRectDist(p0), pointRectDist(p1));
  for (const corner of corners) {
    best = Math.min(best, distToSegment(corner.c, corner.r, p0.c, p0.r, p1.c, p1.r));
  }
  return best;
}

class NavGrid {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.rects = [];
    this.lines = [];
    this.blocked = new Uint8Array(cols * rows);
    this.edgeCache = new Map();
  }

  // Persegi panjang obstacle (dalam satuan tile).
  addRect(c0, r0, c1, r1) {
    this.rects.push([c0, r0, c1, r1]);
  }

  // Dinding tipis (panel partisi) yang membentang dalam satu arah.
  addLine(c0, r0, c1, r1) {
    this.lines.push([c0, r0, c1, r1]);
  }

  build() {
    this.edgeCache.clear();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.pointBlocked(c + 0.5, r + 0.5)) this.blocked[r * this.cols + c] = 1;
      }
    }
  }

  pointBlocked(c, r) {
    for (const [c0, r0, c1, r1] of this.rects) {
      if (
        c >= c0 - NAV_MARGIN &&
        c <= c1 + NAV_MARGIN &&
        r >= r0 - NAV_MARGIN &&
        r <= r1 + NAV_MARGIN
      ) {
        return true;
      }
    }
    for (const [c0, r0, c1, r1] of this.lines) {
      if (distToSegment(c, r, c0, r0, c1, r1) < NAV_WALL_HALF + NAV_CLEARANCE) return true;
    }
    return false;
  }

  cellBlocked(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true;
    return this.blocked[r * this.cols + c] === 1;
  }

  // Sel bebas terdekat dari (c, r).
  nearestFree(c, r) {
    for (let rad = 1; rad <= 8; rad++) {
      let best = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (this.cellBlocked(nc, nr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bestD) {
            bestD = d;
            best = { c: nc, r: nr };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Garis lurus bebas objek? diuji dengan jarak segmen eksak supaya jalur
  // tidak pernah menggesek tepi meja/partisi.
  lineClear(a, b) {
    // Toleransi dikecilkan sedikit dari klasifikasi sel agar sel yang
    // "nempel" tepi objek tetap bisa dicapai (tidak terisolasi).
    const pad = NAV_MARGIN - NAV_SKIN;
    for (const [c0, r0, c1, r1] of this.rects) {
      const d = segRectDist(a, b, c0 - pad, r0 - pad, c1 + pad, r1 + pad);
      if (d <= 0) return false;
    }
    for (const [c0, r0, c1, r1] of this.lines) {
      const d = segSegDist(a, b, { c: c0, r: r0 }, { c: c1, r: r1 });
      if (d < NAV_WALL_HALF + NAV_CLEARANCE - NAV_SKIN) return false;
    }
    return true;
  }

  // Dua sel bertetangga bisa dilewati langsung? (dengan cache)
  edgeClear(idxA, idxB) {
    const key = idxA * this.cols * this.rows + idxB;
    const hit = this.edgeCache.get(key);
    if (hit !== undefined) return hit;
    const a = { c: (idxA % this.cols) + 0.5, r: ((idxA / this.cols) | 0) + 0.5 };
    const b = { c: (idxB % this.cols) + 0.5, r: ((idxB / this.cols) | 0) + 0.5 };
    const ok = this.lineClear(a, b);
    this.edgeCache.set(key, ok);
    return ok;
  }

  // Jalur A* dari `from` ke `to` (keduanya koordinat grid).
  // Mengembalikan daftar titik jalur, atau null bila tidak ada jalan.
  findPath(from, to, exactGoal = false) {
    const start = { c: Math.floor(from.c), r: Math.floor(from.r) };
    if (start.c < 0 || start.r < 0 || start.c >= this.cols || start.r >= this.rows) return null;

    let goalCell = { c: Math.floor(to.c), r: Math.floor(to.r) };
    let goalPoint = { c: to.c, r: to.r };
    if (this.cellBlocked(goalCell.c, goalCell.r)) {
      const alt = this.nearestFree(goalCell.c, goalCell.r);
      if (!alt) return null;
      goalCell = alt;
      if (!exactGoal) goalPoint = { c: alt.c + 0.5, r: alt.r + 0.5 };
    }

    const n = this.cols * this.rows;
    const gScore = new Float32Array(n).fill(Infinity);
    const cameFrom = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const startIdx = start.r * this.cols + start.c;
    const goalIdx = goalCell.r * this.cols + goalCell.c;

    const heuristic = (c, r) => {
      const dc = Math.abs(c - goalCell.c);
      const dr = Math.abs(r - goalCell.r);
      return dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr);
    };

    gScore[startIdx] = 0;
    const open = [{ idx: startIdx, f: heuristic(start.c, start.r) }];
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    let found = false;
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (closed[cur.idx]) continue;
      closed[cur.idx] = 1;
      if (cur.idx === goalIdx) {
        found = true;
        break;
      }
      const cc = cur.idx % this.cols;
      const cr = (cur.idx / this.cols) | 0;
      for (const [dc, dr] of dirs) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const nIdx = nr * this.cols + nc;
        if (closed[nIdx] || this.blocked[nIdx]) continue;
        if (dc !== 0 && dr !== 0) {
          // Jangan memotong sudut tembok.
          if (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc]) continue;
        }
        // Langkah harus benar-benar bebas objek (selama belum keluar dari meja).
        if (cur.idx !== startIdx && !this.edgeClear(cur.idx, nIdx)) continue;
        const step = dc !== 0 && dr !== 0 ? Math.SQRT2 : 1;
        const ng = gScore[cur.idx] + step;
        if (ng < gScore[nIdx]) {
          gScore[nIdx] = ng;
          cameFrom[nIdx] = cur.idx;
          open.push({ idx: nIdx, f: ng + heuristic(nc, nr) });
        }
      }
    }
    if (!found) return null;

    const cells = [];
    let idx = goalIdx;
    while (idx !== -1) {
      cells.push(idx);
      idx = cameFrom[idx];
    }
    cells.reverse();

    const points = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i] % this.cols;
      const r = (cells[i] / this.cols) | 0;
      if (i === 0) points.push({ c: from.c, r: from.r });
      else if (i === cells.length - 1) points.push(goalPoint);
      else points.push({ c: c + 0.5, r: r + 0.5 });
    }
    if (points.length === 1) points.push(goalPoint);
    return this.smooth(points);
  }

  // Meringkas jalur: buang titik belok yang bisa dilewati lurus.
  smooth(points) {
    if (points.length <= 2) return points;
    const out = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      for (; j > i + 1; j--) {
        if (this.lineClear(points[i], points[j])) break;
      }
      out.push(points[j]);
      i = j;
    }
    return out;
  }
}

// Menjalankan objek sepanjang daftar titik (piksel dunia) dengan tween berantai.
function tweenPath(scene, target, points, duration, onUpdate) {
  let resolveFn = null;
  let stopped = false;
  let active = null;
  const promise = new Promise((resolve) => {
    resolveFn = resolve;
  });
  const finish = () => {
    if (resolveFn) {
      const r = resolveFn;
      resolveFn = null;
      r();
    }
  };
  if (!points || points.length < 2) {
    finish();
    return { promise, stop: finish };
  }

  const segs = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Phaser.Math.Distance.BetweenPoints(points[i - 1], points[i]);
    segs.push(d);
    total += d;
  }

  // Satu tween kontinu sepanjang jalur: kecepatan tidak berhenti di tiap
  // waypoint, sehingga langkah terlihat mengalir dan tidak tersendat.
  const sample = (distance) => {
    let d = Phaser.Math.Clamp(distance, 0, total);
    let i = 0;
    while (i < segs.length - 1 && d > segs[i]) {
      d -= segs[i];
      i += 1;
    }
    const from = points[i];
    const to = points[i + 1];
    const k = segs[i] > 0 ? d / segs[i] : 0;
    return {
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k,
    };
  };

  const progress = { t: 0 };
  active = scene.tweens.add({
    targets: progress,
    t: 1,
    duration: Math.max(120, duration),
    ease: "Sine.inOut",
    onUpdate: () => {
      if (stopped) return;
      const p = sample(progress.t * total);
      target.x = p.x;
      target.y = p.y;
      if (onUpdate) onUpdate(target);
    },
    onComplete: () => {
      active = null;
      finish();
    },
  });

  return {
    promise,
    stop() {
      stopped = true;
      if (active) {
        active.stop();
        active = null;
      }
      finish();
    },
  };
}

// Badan orang (kaki berada di titik 0,0) dipakai bersama oleh meja kerja dan NPC.
function paintPerson(g, skin, hair, shirt, isMaster = false) {
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
}

// Slot meja kerja di seluruh kantor, diurutkan dari masteragent ke luar.
function buildSlots() {
  const slots = [];
  for (let j = 0; j < DESK_ROWS; j++) {
    for (let i = 0; i < DESK_COLS; i++) {
      const c = DESK_C0 + i * DESK_STEP;
      const r = DESK_R0 + j * DESK_STEP;
      if (Math.abs(c - MASTER_SLOT.c) < 0.01 && Math.abs(r - MASTER_SLOT.r) < 0.01) continue;
      slots.push({ c, r });
    }
  }
  const dist = (s) => Math.hypot(s.c - MASTER_SLOT.c, s.r - MASTER_SLOT.r);
  slots.sort((a, b) => dist(a) - dist(b));
  return slots;
}

// --- Workstation -----------------------------------------------------------

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
    this.homeC = 0;
    this.homeR = 0;
    this.travelToken = 0;
    this.travelRun = null;
    this.traveler = null;
    this.travelerBody = null;
    this.idleSince = 0;
    this.onBreak = false;
    this.breakToken = 0;
    this.nextBreakAt = 0;
    this.away = false;
    scene.add.existing(this);

    const seed = hashStr(id, 11);
    this.hasLaptop = seed % 3 === 0;
    this.hasTower = seed % 2 === 0;
    this.hasPlant = seed % 4 === 1;
    this.hasPapers = seed % 3 === 1;

    const accent = isMaster ? 0xf1c40f : 0x3a4a63;

    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, 2, DESK_W * 1.05, DESK_D * 0.85);
    this.add(this.shadow);

    // Kursi kerja digambar paling awal -> berada di belakang karakter.
    this.chairGfx = scene.add.graphics();
    this.drawChair(scene, isMaster);
    this.add(this.chairGfx);

    this.char = scene.add.container(0, CHAR_Y);
    this.drawCharacter(scene, id, isMaster);
    this.add(this.char);

    this.deskGfx = scene.add.graphics();
    this.drawDesk(scene, accent);
    this.add(this.deskGfx);

    // Komputer + aksesoris di atas permukaan meja.
    this.propsGfx = scene.add.graphics();
    this.drawProps(scene);
    this.add(this.propsGfx);

    // Layar monitor (menyala sesuai status agent).
    this.screenFill = scene.add
      .rectangle(this.monitorX - 13, this.monitorBase - 14, 26, 16, STATE_COLOR.IDLE)
      .setOrigin(0, 0.5);
    this.add(this.screenFill);

    this.mug = scene.add.graphics();
    this.drawMug();
    this.add(this.mug);

    // Label dipisah ke layer atas agar tidak tertutup meja di depannya.
    this.label = scene.add.container(0, 0).setDepth(100000);
    this.cardBg = scene.add.graphics();
    this.nameText = scene.add
      .text(0, -122, truncate(this.role, 13), {
        fontFamily: "monospace",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#eef3f8",
      })
      .setOrigin(0, 0.5);
    this.statusText = scene.add
      .text(0, -107, "IDLE", {
        fontFamily: "monospace",
        fontSize: "9px",
        color: "#95a5a6",
      })
      .setOrigin(0, 0.5);
    this.barBg = scene.add.graphics();
    this.barFill = scene.add.graphics();
    this.label.add([this.cardBg, this.nameText, this.statusText, this.barBg, this.barFill]);

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
      .container(0, -152, [this.bubbleBg, this.bubbleText])
      .setVisible(false);
    this.drawCard(accent);

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
    this.skin = pick(SKIN, id, 1);
    this.hair = pick(HAIR, id, 2);
    this.shirt = isMaster ? 0x2c3e50 : pick(SHIRTS, id, 0);
    const g = scene.add.graphics();
    paintPerson(g, this.skin, this.hair, this.shirt, isMaster);
    this.char.add(g);
  }

  // Kursi kantor ergonomis di belakang karakter.
  drawChair(scene, isMaster) {
    const g = this.chairGfx;
    const frame = isMaster ? 0x2b3a55 : 0x2f3944;
    const seat = isMaster ? 0x38507a : 0x3b4552;
    const top = CHAR_Y - 50;
    const bottom = CHAR_Y - 12;
    g.fillStyle(0x1f262e, 1);
    g.fillRoundedRect(-20, top, 40, bottom - top, 10);
    g.fillStyle(seat, 1);
    g.fillRoundedRect(-18, top + 2, 36, bottom - top - 4, 9);
    g.fillStyle(frame, 1);
    g.fillRoundedRect(-23, top + 8, 6, 22, 3);
    g.fillRoundedRect(17, top + 8, 6, 22, 3);
    g.fillStyle(0x262d36, 1);
    g.fillEllipse(0, CHAR_Y - 8, 42, 14);
    g.fillStyle(seat, 1);
    g.fillEllipse(0, CHAR_Y - 10, 36, 11);
  }

  drawDesk(scene, accent) {
    const g = this.deskGfx;
    const hw = DESK_W / 2;
    const hd = DESK_D / 2;

    // Sisi kiri dan kanan (bahan kayu gelap).
    g.fillStyle(0x4e342e, 1);
    fillQuad(g, [
      { x: -hw, y: 0 },
      { x: 0, y: hd },
      { x: 0, y: hd - DESK_H },
      { x: -hw, y: -DESK_H },
    ]);
    g.fillStyle(0x6d4c41, 1);
    fillQuad(g, [
      { x: hw, y: 0 },
      { x: 0, y: hd },
      { x: 0, y: hd - DESK_H },
      { x: hw, y: -DESK_H },
    ]);

    // Permukaan meja.
    g.fillStyle(0x8d6e63, 1);
    const top = [
      { x: 0, y: -hd - DESK_H },
      { x: hw, y: -DESK_H },
      { x: 0, y: hd - DESK_H },
      { x: -hw, y: -DESK_H },
    ];
    fillQuad(g, top);
    g.lineStyle(2, accent, 0.85);
    strokeQuad(g, top, 2, 0.85, accent);

    // Panel laci di sisi kanan.
    g.lineStyle(1.5, 0x4e342e, 0.9);
    g.strokePoints(
      toPoints([
        hw - 12, -4,
        hw - 12, -DESK_H + 4,
        hw - 2, -DESK_H + 8,
        hw - 2, 0,
      ]),
      true,
      true
    );
  }

  // Komputer dan aksesoris yang menempel di permukaan meja.
  drawProps(scene) {
    const g = this.propsGfx;

    // --- Monitor utama (kiri meja), berdiri di bagian belakang meja ---
    this.monitorX = -20;
    this.monitorBase = -30;
    const mx = this.monitorX;
    const mb = this.monitorBase;
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(mx - 15, mb - 24, 30, 20, 3);
    g.fillStyle(0x1e2b3a, 1);
    g.fillRoundedRect(mx - 13, mb - 22, 26, 16, 2);
    g.fillStyle(0x2b3648, 1);
    g.fillRect(mx - 2, mb - 6, 4, 6);
    g.fillEllipse(mx, mb, 16, 7);

    // --- Keyboard (bagian depan meja) ---
    const kb = planeQuad(-6, -DESK_H + 7, 0.85, 0.4);
    g.fillStyle(0x1b2532, 1);
    fillQuad(g, kb);
    g.lineStyle(1, 0x44566b, 0.9);
    strokeQuad(g, kb, 1, 0.9, 0x44566b);
    g.fillStyle(0x6d7f92, 0.85);
    for (let i = 0; i < 5; i++) {
      const u = -0.3 + i * 0.15;
      fillQuad(g, planeQuad(-6 + AX.x * u, -DESK_H + 7 + AX.y * u, 0.1, 0.26));
    }

    // --- Mouse ---
    g.fillStyle(0x1b2532, 1);
    g.fillEllipse(21, -DESK_H + 5, 9, 6);

    // --- Laptop (sebagian meja) ---
    if (this.hasLaptop) {
      const lx = 18;
      const ly = -DESK_H + 12;
      g.fillStyle(0x9aa7b5, 1);
      fillQuad(g, planeQuad(lx, ly, 0.6, 0.42));
      g.fillStyle(0x1b2532, 1);
      fillQuad(g, planeQuad(lx, ly - 8, 0.58, 0.04));
      g.fillStyle(0x22303f, 1);
      g.fillPoints(
        toPoints([lx - 11, ly - 9, lx + 11, ly - 9, lx + 9, ly - 21, lx - 9, ly - 21]),
        true
      );
      g.fillStyle(0x0f1620, 1);
      g.fillPoints(
        toPoints([lx - 9, ly - 11, lx + 9, ly - 11, lx + 7, ly - 19, lx - 7, ly - 19]),
        true
      );
    }

    // --- CPU tower di lantai, di samping meja ---
    if (this.hasTower) {
      const tx = -40;
      g.fillStyle(0x1b2532, 1);
      fillQuad(g, [
        { x: tx - 7, y: -2 },
        { x: tx, y: 3 },
        { x: tx, y: -19 },
        { x: tx - 7, y: -24 },
      ]);
      g.fillStyle(0x2b3648, 1);
      fillQuad(g, [
        { x: tx, y: 3 },
        { x: tx + 8, y: -1 },
        { x: tx + 8, y: -23 },
        { x: tx, y: -19 },
      ]);
      g.fillStyle(0x2ecc71, 0.9);
      g.fillCircle(tx + 3, -8, 1.2);
      g.fillStyle(0x3498db, 0.9);
      g.fillCircle(tx + 3, -13, 1.2);
    }

    // --- Kertas / notepad ---
    if (this.hasPapers) {
      g.fillStyle(0xe8eef5, 1);
      fillQuad(g, planeQuad(-2, -DESK_H - 3, 0.32, 0.28));
      g.lineStyle(1, 0xaab8c6, 0.9);
      strokeQuad(g, planeQuad(-2, -DESK_H - 3, 0.32, 0.28), 1, 0.9, 0xaab8c6);
    }

    // --- Lampu meja ---
    g.fillStyle(0x37474f, 1);
    g.fillRect(29, -DESK_H - 18, 3, 18);
    g.fillStyle(0xf5f7fa, 1);
    g.fillPoints(
      toPoints([25, -DESK_H - 18, 33, -DESK_H - 18, 29, -DESK_H - 26]),
      true
    );
  }

  drawMug() {
    const g = this.mug;
    g.fillStyle(0xecf0f1, 1);
    g.fillRoundedRect(6, -DESK_H - 8, 9, 9, 2);
    g.lineStyle(1.5, 0xecf0f1, 1);
    g.strokeCircle(16, -DESK_H - 4, 3);
  }

  drawCard(accent) {
    // Kartu dibatasi 98px agar tidak menutupi kartu tetangga (jarak meja 102px).
    const w = Math.min(Math.max(this.nameText.width, 54) + 20, 98);
    this.cardW = w;
    this.cardBg.clear();
    this.cardBg.fillStyle(0x0d1522, 0.92);
    this.cardBg.fillRoundedRect(-w / 2, -136, w, 44, 6);
    this.cardBg.lineStyle(1.2, accent, 0.95);
    this.cardBg.strokeRoundedRect(-w / 2, -136, w, 44, 6);
    this.nameText.setPosition(-w / 2 + 10, -122);
    this.statusText.setPosition(-w / 2 + 10, -107);
    this.barBg.clear();
    this.barBg.fillStyle(0x22303f, 1);
    this.barBg.fillRoundedRect(-w / 2 + 10, -101, w - 20, 5, 2.5);
    this.drawBar(0);
  }

  drawBar(progress) {
    const w = this.cardW - 20;
    this.barFill.clear();
    if (progress <= 0) return;
    const color = STATE_COLOR[this.state] ?? STATE_COLOR.DEFAULT;
    this.barFill.fillStyle(color, 1);
    this.barFill.fillRoundedRect(-w / 2 + 10, -101, Math.max(4, w * progress), 5, 2.5);
  }

  setPosition(x, y) {
    this.homeX = x;
    this.homeY = y;
    const g = gridOf(x, y);
    this.homeC = g.c;
    this.homeR = g.r;
    if (!this.travelling) super.setPosition(x, y);
    return this;
  }

  // Karakter yang berjalan meninggalkan meja; perabot tetap di tempatnya.
  ensureTraveler() {
    if (this.traveler) return this.traveler;
    const body = this.scene.add.graphics();
    paintPerson(body, this.skin, this.hair, this.shirt, this.isMaster);
    body.setPosition(0, CHAR_Y);
    const traveler = this.scene.add.container(this.x, this.y, [body]);
    this.scene.tweens.add({
      targets: body,
      y: CHAR_Y - 3,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    traveler.setDepth(this.y + 2);
    this.traveler = traveler;
    this.travelerBody = body;
    return traveler;
  }

  removeTraveler() {
    if (this.travelerBody) {
      this.scene.tweens.killTweensOf(this.travelerBody);
      this.travelerBody = null;
    }
    if (this.traveler) {
      this.scene.tweens.killTweensOf(this.traveler);
      this.traveler.destroy();
      this.traveler = null;
    }
    this.char.setVisible(true);
  }

  travel(c, r, duration = MEETING_TRAVEL) {
    this.cancelTravel();
    this.travelling = true;
    this.char.setVisible(false);
    const token = ++this.travelToken;
    const traveler = this.ensureTraveler();
    const path = this.scene.pathTo(traveler.x, traveler.y, c, r, true);
    const dur = this.scene.pathDuration(path, duration);
    const run = tweenPath(this.scene, traveler, path, dur, (t) => traveler.setDepth(t.y + 2));
    this.travelRun = run;
    return new Promise((resolve) => {
      this.travelResolve = resolve;
      run.promise.then(() => {
        if (this.travelToken !== token) return;
        this.travelResolve = null;
        this.travelRun = null;
        traveler.setDepth(traveler.y + 2);
        resolve();
      });
    });
  }

  // Menghentikan perjalanan dan melepas promise yang menggantung.
  cancelTravel() {
    this.travelToken++;
    if (this.travelRun) {
      this.travelRun.stop();
      this.travelRun = null;
    }
    if (this.travelResolve) {
      const done = this.travelResolve;
      this.travelResolve = null;
      done();
    }
  }

  goHome(duration = MEETING_TRAVEL) {
    this.cancelTravel();
    if (!this.traveler) {
      this.travelling = false;
      this.char.setVisible(true);
      return Promise.resolve();
    }
    const token = ++this.travelToken;
    const traveler = this.traveler;
    const path = this.scene.pathTo(traveler.x, traveler.y, this.homeC, this.homeR, true);
    const dur = this.scene.pathDuration(path, duration);
    const run = tweenPath(this.scene, traveler, path, dur, (t) => traveler.setDepth(t.y + 2));
    this.travelRun = run;
    return new Promise((resolve) => {
      this.travelResolve = resolve;
      run.promise.then(() => {
        if (this.travelToken !== token) return;
        this.travelResolve = null;
        this.travelRun = null;
        this.travelling = false;
        this.setDepth(this.homeY);
        this.removeTraveler();
        resolve();
      });
    });
  }

  // Status "istirahat" ketika karyawan meninggalkan meja.
  setAway(away, label = "istirahat") {
    this.away = away;
    if (away) {
      this.statusText.setText(label).setColor("#f1c40f");
      this.drawBar(0);
      return;
    }
    const color = STATE_COLOR[this.state] ?? STATE_COLOR.DEFAULT;
    this.statusText
      .setText(STATE_LABEL[this.state] ?? this.state)
      .setColor(`#${color.toString(16).padStart(6, "0")}`);
  }

  appear() {
    this.setAlpha(0);
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 300 });
    this.char.x = 90;
    this.scene.tweens.add({ targets: this.char, x: 0, duration: 900, ease: "Cubic.out" });
  }

  setLabel(label) {
    this.role = label;
    this.nameText.setText(truncate(label, 13));
    this.drawCard(this.isMaster ? 0xf1c40f : 0x3a4a63);
  }

  setTask(task) {
    if (!task) {
      this.bubble.setVisible(false);
      return;
    }
    this.bubbleText.setText(truncate(task, 16));
    const w = this.bubbleText.width + 16;
    const h = this.bubbleText.height + 10;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0x1b2430, 0.95);
    this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    this.bubbleBg.lineStyle(1, 0x5b7ba8, 0.6);
    this.bubbleBg.fillTriangle(-5, h / 2, 5, h / 2, 0, h / 2 + 7);
    this.bubble.setVisible(true);
    this.syncBubble();
  }

  // Nama + status ikut karakter (atau traveler saat meninggalkan meja).
  syncLabel() {
    const actor = this.traveler ?? this;
    this.label.setPosition(actor.x, actor.y);
    this.label.setDepth(100000 + actor.y);
  }

  // Gelembung ikut karakter (atau traveler saat meninggalkan meja).
  syncBubble() {
    if (!this.bubble.visible) return;
    const actor = this.traveler ?? this;
    const feetY = actor.y + CHAR_Y;
    this.bubble.setPosition(actor.x, feetY - 118);
    this.bubble.setDepth(feetY + 4);
  }

  setState(state, task, progress) {
    this.idleSince = this.scene.time.now;
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
    this.drawBar(this.state === "IDLE" ? 0 : this.progress);
  }

  tick() {
    if (this.indeterminate) {
      this.phase += 0.14;
      const s = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(this.phase));
      this.screenFill.setScale(s, 1);
      this.drawBar(0.35 + 0.35 * (0.5 + 0.5 * Math.sin(this.phase)));
      return;
    }
    this.progress += (this.target - this.progress) * 0.25;
    if (this.target - this.progress < 0.005) this.progress = this.target;
    this.screenFill.setScale(this.progress, 1);
    this.drawBar(this.progress);
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
    this.idleSince = this.scene.time.now;
    this.nextBreakAt = 0;
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
    this.drawBar(0);
  }

  stroll() {
    if (this.state !== "IDLE" || this.strolling || this.onBreak || this.travelling || this.char.x !== 0) return;
    this.strolling = true;
    this.bob.pause();
    this.scene.tweens.add({
      targets: this.char,
      x: Phaser.Math.Between(-45, 45),
      y: CHAR_Y + Phaser.Math.Between(-6, 6),
      duration: 1600,
      yoyo: true,
      ease: "Sine.inOut",
      onComplete: () => {
        this.char.setPosition(0, CHAR_Y);
        this.bob.resume();
        this.strolling = false;
      },
    });
  }
}

// --- NPC: orang yang berjalan sendiri di kantor ----------------------------

class Actor extends Phaser.GameObjects.Container {
  constructor(scene, id, opts = {}) {
    super(scene, 0, 0);
    this.actorId = id;
    this.kind = opts.kind || "guest";
    this.alive = true;
    this.walking = false;
    this.away = false;
    this.depthBias = 0;
    scene.add.existing(this);

    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x000000, 0.22);
    this.shadow.fillEllipse(0, 2, 26, 10);
    this.add(this.shadow);

    this.char = scene.add.container(0, 0);
    const skin = pick(SKIN, id, 1);
    const hair = pick(HAIR, id, 2);
    const shirt = opts.shirt ?? pick(SHIRTS, id, 0);
    const body = scene.add.graphics();
    paintPerson(body, skin, hair, shirt);
    this.char.add(body);
    this.add(this.char);

    // Alat kerja / aksesori (pel, tas).
    this.tool = scene.add.container(0, 0);
    this.char.add(this.tool);
    if (opts.prop === "mop") this.drawMop();
    if (opts.prop === "tas") this.drawBag();

    // Gelembung bicara.
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, 0, "", { fontFamily: "monospace", fontSize: "10px", color: "#eef3f8", align: "center" })
      .setOrigin(0.5);
    this.bubble = scene.add.container(0, -96, [this.bubbleBg, this.bubbleText]).setVisible(false);
    this.add(this.bubble);

    // Label peran supaya mudah dikenali.
    if (opts.tag) {
      this.tagText = scene.add
        .text(0, -70, opts.tag, { fontFamily: "monospace", fontSize: "9px", color: "#cfe3f7" })
        .setOrigin(0.5);
      this.tagBg = scene.add.graphics();
      this.tagBg.fillStyle(0x1b2430, 0.8);
      this.tagBg.fillRoundedRect(
        -this.tagText.width / 2 - 5,
        -this.tagText.height / 2 - 2,
        this.tagText.width + 10,
        this.tagText.height + 4,
        4
      );
      this.add([this.tagBg, this.tagText]);
    }

    this.bob = scene.tweens.add({
      targets: this.char,
      y: -3,
      duration: 780,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    this.sway = scene.tweens.add({
      targets: this.char,
      angle: 2.5,
      duration: 320,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
      paused: true,
    });
  }

  drawMop() {
    const g = this.scene.add.graphics();
    g.fillStyle(0x8d6e63, 1);
    g.fillRect(-1.5, 0, 3, 38);
    g.fillStyle(0xcfd8dc, 1);
    g.fillRoundedRect(-8, 36, 16, 10, 3);
    g.fillStyle(0xb0bec5, 1);
    g.fillRoundedRect(-6, 34, 12, 5, 2);
    this.tool.add(g);
    this.tool.setPosition(14, -30);
  }

  drawBag() {
    const g = this.scene.add.graphics();
    g.fillStyle(0x6d4c41, 1);
    g.fillRoundedRect(-9, -3, 18, 14, 2);
    g.fillStyle(0x4e342e, 1);
    g.fillRect(-4, -7, 8, 4);
    this.tool.add(g);
    this.tool.setPosition(15, -24);
  }

  spawn(c, r) {
    const p = iso(c, r);
    this.setPosition(p.x, p.y);
    this.setDepth(p.y + 2 + this.depthBias);
    this.setAlpha(0);
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 400 });
    return this;
  }

  walkTo(c, r, duration = 2200) {
    if (!this.alive) return Promise.resolve();
    const path = this.scene.pathTo(this.x, this.y, c, r);
    const dur = this.scene.pathDuration(path, duration * WALK_TIME_SCALE);
    this.walking = true;
    this.bob.timeScale = 1.9;
    this.sway.resume();
    const run = tweenPath(
      this.scene,
      this,
      path,
      dur,
      (t) => this.setDepth(t.y + 2 + this.depthBias)
    );
    this.walkRun = run;
    return run.promise.then(() => {
      this.walkRun = null;
      this.walking = false;
      this.bob.timeScale = 1;
      this.sway.pause();
      this.char.setAngle(0);
      this.setDepth(this.y + 2 + this.depthBias);
    });
  }

  say(text, duration = 2800) {
    if (!this.alive) return;
    this.bubbleText.setText(text);
    const w = this.bubbleText.width + 16;
    const h = this.bubbleText.height + 10;
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(0x1b2430, 0.95);
    this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    this.bubbleBg.lineStyle(1, 0x5b7ba8, 0.6);
    this.bubbleBg.fillTriangle(-5, h / 2, 5, h / 2, 0, h / 2 + 7);
    this.bubble.setVisible(true);
    this.scene.tweens.killTweensOf(this.bubble);
    this.bubble.setAlpha(1);
    this.scene.time.delayedCall(duration, () => {
      if (this.alive) this.bubble.setVisible(false);
    });
  }

  // Sapu lantai: pel berayun + debu yang hilang.
  clean(duration = 4000) {
    if (!this.alive) return Promise.resolve();
    this.say("membersihkan", 2200);
    this.bob.timeScale = 1.6;
    const sweep = this.scene.tweens.add({
      targets: this.tool,
      angle: { from: -30, to: 30 },
      duration: 420,
      yoyo: true,
      repeat: Math.max(1, Math.floor(duration / 420) - 1),
      ease: "Sine.inOut",
    });
    const dust = this.scene.time.addEvent({
      delay: 240,
      loop: true,
      callback: () => this.dust(),
    });
    return new Promise((resolve) => {
      this.scene.time.delayedCall(duration, () => {
        sweep.stop();
        this.tool.setAngle(0);
        dust.remove();
        this.bob.timeScale = 1;
        resolve();
      });
    });
  }

  dust() {
    if (!this.alive) return;
    const spot = this.scene.add.circle(this.tool.x + 6, this.tool.y + 40, 3, 0x9fb3c8, 0.45);
    this.char.add(spot);
    this.scene.tweens.add({
      targets: spot,
      y: this.tool.y + 26,
      alpha: 0,
      scale: 0.4,
      duration: 900,
      ease: "Cubic.out",
      onComplete: () => spot.destroy(),
    });
  }

  destroy() {
    this.alive = false;
    this.scene.tweens.killTweensOf(this);
    super.destroy();
  }
}

// --- Dekorasi -------------------------------------------------------------

function drawPlant(scene, x, y, scale = 1) {
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x, y, 34 * scale, 12 * scale);
  g.fillStyle(0x8d6e63, 1);
  g.fillPoints(
    toPoints([
      x, y - 8 * scale, x + 12 * scale, y - 2 * scale,
      x, y + 8 * scale, x - 12 * scale, y - 2 * scale,
    ]),
    true
  );
  g.fillStyle(0x6d4c41, 1);
  g.fillPoints(
    toPoints([
      x - 12 * scale, y - 2 * scale, x, y + 8 * scale,
      x, y + 14 * scale, x - 12 * scale, y + 4 * scale,
    ]),
    true
  );
  g.fillPoints(
    toPoints([
      x + 12 * scale, y - 2 * scale, x, y + 8 * scale,
      x, y + 14 * scale, x + 12 * scale, y + 4 * scale,
    ]),
    true
  );
  g.fillStyle(0x2e7d32, 1);
  g.fillEllipse(x - 8 * scale, y - 28 * scale, 22 * scale, 40 * scale);
  g.fillEllipse(x + 8 * scale, y - 28 * scale, 22 * scale, 40 * scale);
  g.fillStyle(0x43a047, 1);
  g.fillEllipse(x, y - 38 * scale, 20 * scale, 46 * scale);
  g.setDepth(y);
  return g;
}

// Jam digital 7-segmen yang menempel di bidang dinding kanan (r tetap = -0.5).
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

// Kursi rapat (dari belakang, menghadap meja).
function drawMeetingChair(scene, c, r, color = 0x546e7a) {
  const p = iso(c, r);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(p.x, p.y + 4, 26, 10);
  g.fillStyle(color, 1);
  g.fillPoints(
    toPoints([p.x, p.y - 6, p.x + 11, p.y - 1, p.x, p.y + 4, p.x - 11, p.y - 1]),
    true
  );
  g.fillStyle(0x455a64, 1);
  g.fillPoints(
    toPoints([p.x - 11, p.y - 1, p.x, p.y + 4, p.x, p.y + 12, p.x - 11, p.y + 7]),
    true
  );
  g.fillPoints(
    toPoints([p.x + 11, p.y - 1, p.x, p.y + 4, p.x, p.y + 12, p.x + 11, p.y + 7]),
    true
  );
  g.fillStyle(0x78909c, 1);
  g.fillRoundedRect(p.x - 10, p.y - 20, 20, 16, 4);
  g.setDepth(p.y - 1);
  return g;
}

// --- Scene ----------------------------------------------------------------

class StudioScene extends Phaser.Scene {
  constructor() {
    super("studio");
    this.desks = {};
    this.order = [];
    this.meetings = [];
    this.meetingActive = false;
    this.nextBreakAllowedAt = 0;
    this.currentProjectSlug = null;
    this.projectFoldersLoaded = false;
    this.slots = [];
    this.dragging = false;
    this.npcs = [];
    this.guests = [];
    this.guestCounter = 0;
    this.scanSerial = 0;
    this.browseSerial = 0;
    this.scanTimer = null;
    this.scanPath = null;
  }

  create() {
    this.slots = buildSlots();
    this.buildNav();

    this.drawWalls();
    this.drawFloor();
    this.drawPartitions();
    this.drawMeetingRoom();
    this.drawPantry();
    this.drawServerRoom();
    this.drawLounge();
    this.drawReception();
    this.drawOfficeProps();
    this.drawDecor();
    this.drawEntrance();
    this.setupCamera();
    window.__studio = this;

    this.addDesk("masteragent", "masteragent", true);
    this.createNpcs();
    this.connect();
    this.initProjectSelector();

    this.time.addEvent({
      delay: 6000,
      loop: true,
      callback: () => this.strollRandom(),
    });

    // Cek siapa saja yang boleh keluar ruangan karena menganggur.
    this.time.addEvent({
      delay: 8000,
      loop: true,
      callback: () => this.checkBreaks(),
    });
  }

  update(time, delta) {
    const cam = this.cameras.main;
    // Kecepatan pan berbasis waktu (bukan jumlah frame) agar konsisten di 30/60 fps.
    const dt = Math.min(delta, 100) / 1000;
    const speed = 420 * cam.zoom * dt;

    const left = this.keys.left;
    const right = this.keys.right;
    const up = this.keys.up;
    const down = this.keys.down;
    if (left) cam.scrollX -= speed;
    if (right) cam.scrollX += speed;
    if (up) cam.scrollY -= speed;
    if (down) cam.scrollY += speed;
    if (left || right || up || down) this.clampCamera();

    // Label + gelembung selalu mengikuti karakternya.
    for (const id of Object.keys(this.desks)) {
      const desk = this.desks[id];
      if (!desk.label) continue;
      desk.syncLabel();
      desk.syncBubble();
    }
  }

  setupCamera() {
    const cam = this.cameras.main;
    this.worldBounds = {
      x: OX - ROWS * (TILE_W / 2) - 70,
      y: OY - WALL_H - 60,
      width: (COLS + ROWS) * (TILE_W / 2) + 140,
      height: (COLS + ROWS) * (TILE_H / 2) + WALL_H + 170,
    };

    this.keys = { left: false, right: false, up: false, down: false };
    const isTyping = (target) =>
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
    const keyMap = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    window.addEventListener("keydown", (e) => {
      if (isTyping(e.target)) return;
      const dir = keyMap[e.key];
      if (!dir) return;
      this.keys[dir] = true;
      e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      const dir = keyMap[e.key];
      if (dir) this.keys[dir] = false;
    });
    window.addEventListener("blur", () => {
      this.keys.left = this.keys.right = this.keys.up = this.keys.down = false;
    });

    this.input.on("pointerdown", (pointer) => {
      // Klik di panggung → lepas fokus dari input prompt, supaya panah kembali menggeser kamera.
      const el = document.activeElement;
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
      this.dragging = true;
      this.dragOrigin = { x: pointer.x, y: pointer.y, sx: cam.scrollX, sy: cam.scrollY };
    });
    this.input.on("pointermove", (pointer) => {
      if (!this.dragging) return;
      const zoom = cam.zoom;
      cam.scrollX = this.dragOrigin.sx - (pointer.x - this.dragOrigin.x) / zoom;
      cam.scrollY = this.dragOrigin.sy - (pointer.y - this.dragOrigin.y) / zoom;
      this.clampCamera();
    });
    this.input.on("pointerup", () => {
      this.dragging = false;
    });
    this.input.on("pointerupoutside", () => {
      this.dragging = false;
    });

    this.input.on("wheel", (pointer, over, dx, dy) => {
      const next = Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.92 : 1.08), 0.5, 2.2);
      cam.setZoom(next);
      this.clampCamera();
    });

    this.scale.on("resize", () => this.clampCamera());

    const focus = iso(MASTER_SLOT.c, MASTER_SLOT.r);
    cam.setZoom(DEFAULT_ZOOM);
    // Pada Phaser, titik tengah layar = scroll + width/2 (zoom tidak mengubahnya).
    cam.scrollX = focus.x - cam.width / 2;
    cam.scrollY = focus.y - cam.height / 2;
    this.clampCamera();
  }

  clampCamera() {
    const cam = this.cameras.main;
    const b = this.worldBounds;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    if (b.width <= vw) cam.scrollX = b.x + (b.width - vw) / 2;
    else cam.scrollX = Phaser.Math.Clamp(cam.scrollX, b.x, b.x + b.width - vw);
    if (b.height <= vh) cam.scrollY = b.y + (b.height - vh) / 2;
    else cam.scrollY = Phaser.Math.Clamp(cam.scrollY, b.y, b.y + b.height - vh);
  }

  async initProjectSelector() {
    const select = document.getElementById("project-folder");
    const refreshBtn = document.getElementById("refresh-projects");
    const dirSelect = document.getElementById("project-path");
    const refreshDirs = document.getElementById("refresh-dirs");
    const statusEl = document.getElementById("status");
    let browsePath = null;

    const loadFolders = async () => {
      try {
        const res = await fetch(PROJECT_FOLDERS_URL);
        const data = await res.json();
        const folders = data.folders || [];

        select.innerHTML = '<option value="">-- Pilih folder proyek --</option>';
        for (const folder of folders) {
          const opt = document.createElement("option");
          opt.value = folder.slug;
          opt.textContent = folder.name + (folder.has_animation ? " ✓" : "");
          select.appendChild(opt);
        }

        if (!this.projectFoldersLoaded && folders.length > 0) {
          this.projectFoldersLoaded = true;
          if (statusEl) statusEl.textContent = `${folders.length} folder proyek ditemukan`;
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = `gagal memuat folder: ${err.message}`;
      }
    };

    select.addEventListener("change", async (e) => {
      const slug = e.target.value;
      this.browseSerial += 1;
      this.stopScanPoll();
      this.scanPath = null;
      if (!slug) {
        this.clearNonMasterDesks();
        this.currentProjectSlug = null;
        if (statusEl) statusEl.textContent = "tidak ada proyek dipilih";
        return;
      }
      await this.loadProjectAgents(slug);
    });

    dirSelect?.addEventListener("change", async (e) => {
      const path = e.target.value;
      if (!path) return;
      const data = await this.browseDirectories(path);
      if (data) browsePath = data.path;
    });

    refreshDirs?.addEventListener("click", async () => {
      const data = await this.browseDirectories(browsePath);
      if (data) browsePath = data.path;
    });

    refreshBtn.addEventListener("click", loadFolders);
    await loadFolders();

    if (!dirSelect) return;

    let initial = "";
    try {
      initial = localStorage.getItem("opencode-studio:scan-path") || "";
    } catch {
      /* localStorage bisa diblokir */
    }
    if (!initial) {
      try {
        const res = await fetch(SCAN_DEFAULT_URL);
        if (res.ok) {
          const data = await res.json();
          initial = data.project_path || "";
        }
      } catch {
        /* pakai default server */
      }
    }

    let data = initial ? await this.browseDirectories(initial, { quiet: true }) : null;
    if (!data) data = await this.browseDirectories(null, { quiet: true });
    if (data) browsePath = data.path;
  }

  renderDirectoryOptions(data) {
    const dirSelect = document.getElementById("project-path");
    if (!dirSelect) return;

    const add = (value, text) => {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = text;
      dirSelect.appendChild(opt);
    };

    dirSelect.innerHTML = "";
    add(data.path, `${data.name}/ — ${data.is_project ? "proyek" : "bukan proyek"}`);
    if (data.parent) add(data.parent, ".. (naik)");
    if (data.home && data.home !== data.path) add(data.home, `Home: ${data.home}`);
    if (data.repo && data.repo !== data.path) {
      const repoName = data.repo.split("/").filter(Boolean).pop() || data.repo;
      add(data.repo, `Repo: ${repoName}`);
    }
    for (const dir of data.dirs || []) {
      add(dir.path, `${dir.name}/` + (dir.has_agents ? " — proyek" : ""));
    }
    dirSelect.value = data.path;
  }

  async browseDirectories(path, { quiet = false } = {}) {
    const statusEl = document.getElementById("status");
    const url = path ? `${BROWSE_DIRS_URL}?path=${encodeURIComponent(path)}` : BROWSE_DIRS_URL;
    const token = ++this.browseSerial;
    try {
      const res = await fetch(url);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      if (token !== this.browseSerial) return null;

      this.renderDirectoryOptions(data);
      if (data.is_project) {
        const outputSelect = document.getElementById("project-folder");
        if (outputSelect) outputSelect.value = "";
        await this.scanProjectDirectory(data.path);
      } else {
        this.stopScanPoll();
        this.scanPath = null;
        if (!quiet && statusEl) {
          statusEl.textContent = `folder: ${data.name} · bukan proyek (.opencode/agents tidak ada)`;
        }
      }
      return token === this.browseSerial ? data : null;
    } catch (err) {
      if (!quiet && statusEl) statusEl.textContent = `gagal membuka folder: ${err.message}`;
      return null;
    }
  }

  stopScanPoll() {
    this.scanSerial += 1;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
  }

  removeDesk(id) {
    const desk = this.desks[id];
    if (!desk) return;
    if (desk.label) desk.label.destroy();
    if (desk.bubble) desk.bubble.destroy();
    desk.destroy();
    delete this.desks[id];
    this.order = this.order.filter((item) => item !== id);
  }

  applyScannedAgents(data) {
    const states = {
      idle: "IDLE",
      working: "WORKING",
      thinking: "THINKING",
      done: "DONE",
      blocked: "BLOCKED",
      meeting: "MEETING",
    };
    const agents = data.agents || [];
    const keep = new Set(agents.map((agent) => agent.id));

    for (const id of [...this.order]) {
      if (!keep.has(id)) this.removeDesk(id);
    }

    for (const agent of agents) {
      const state = states[agent.status] || "IDLE";
      const role = agent.role || agent.name || agent.id;
      const desk = this.addDesk(agent.id, role);
      if (!desk) continue;
      if (desk.scanStatus === agent.status) continue;
      desk.scanStatus = agent.status;
      this.setAgent(agent.id, state, agent.description || null, role);
    }

    const master = data.masteragent;
    if (master) {
      const desk = this.addDesk("masteragent");
      if (desk && desk.scanStatus !== master.status) {
        desk.scanStatus = master.status;
        desk.setState(states[master.status] || "IDLE", master.description || null);
      }
    }

    const ordered = agents
      .slice()
      .sort((a, b) => a.desk_id - b.desk_id)
      .map((agent) => agent.id)
      .filter((id) => this.desks[id]);
    const extras = this.order.filter((id) => !ordered.includes(id));
    this.order = [...ordered, ...extras];
    this.layout();
  }

  scheduleScanPoll(token, path) {
    this.scanTimer = setTimeout(() => this.pollScannedProject(token, path), 2000);
  }

  async pollScannedProject(token, path) {
    if (token !== this.scanSerial) return;
    try {
      const res = await fetch(SCAN_AGENTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_path: path }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && token === this.scanSerial) {
        this.applyScannedAgents(data);
        const statusEl = document.getElementById("status");
        const counts = data.counts || {};
        const label = String(data.projectPath || path).split("/").filter(Boolean).pop() || path;
        if (statusEl) {
          statusEl.textContent = `studio: ${label} · ${counts.total || 0} agen` +
            (counts.working ? ` · ${counts.working} working` : "");
        }
      }
    } catch {
      /* coba lagi di tick berikutnya */
    }
    if (token === this.scanSerial) this.scheduleScanPoll(token, path);
  }

  async scanProjectDirectory(path) {
    const statusEl = document.getElementById("status");
    this.stopScanPoll();
    const token = this.scanSerial;
    this.scanPath = path;

    try {
      if (statusEl) statusEl.textContent = `memindai ${path}…`;
      const res = await fetch(SCAN_AGENTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_path: path }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
      if (token !== this.scanSerial) return;

      this.currentProjectSlug = null;
      this.applyScannedAgents(data);
      localStorage.setItem("opencode-studio:scan-path", path);

      const counts = data.counts || {};
      const label = String(data.projectPath || path).split("/").filter(Boolean).pop() || path;
      if (statusEl) {
        statusEl.textContent = `studio: ${label} · ${counts.total || 0} agen`;
      }
      this.scheduleScanPoll(token, path);
    } catch (err) {
      if (token !== this.scanSerial) return;
      if (statusEl) statusEl.textContent = `gagal memindai: ${err.message}`;
    }
  }

  async loadProjectAgents(slug) {
    const statusEl = document.getElementById("status");
    this.stopScanPoll();
    this.scanPath = null;
    try {
      if (statusEl) statusEl.textContent = `memuat agen dari ${slug}…`;
      const res = await fetch(`${PROJECT_AGENTS_URL}/${slug}/agents`);
      const data = await res.json();
      const agents = data.agents || [];

      this.clearNonMasterDesks();

      for (const agent of agents) {
        if (agent.agent_id) this.addDesk(agent.agent_id, agent.role);
      }

      this.currentProjectSlug = slug;
      if (statusEl) statusEl.textContent = `proyek aktif: ${slug} (${agents.length} agen)`;
    } catch (err) {
      if (statusEl) statusEl.textContent = `gagal memuat agen: ${err.message}`;
    }
  }

  clearNonMasterDesks() {
    for (const id of [...this.order]) this.removeDesk(id);
    this.order = [];
    this.layout();
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
    g.fillStyle(0x27313f, 1);
    g.fillPoints(left, true);
    g.fillStyle(0x2e3a4a, 1);
    g.fillPoints(right, true);
    g.lineStyle(2, 0x41576f, 0.9);
    g.strokePoints(left, true, true);
    g.strokePoints(right, true, true);
    g.lineStyle(2, 0x41576f, 0.55);
    for (let i = 3; i < COLS; i += 3) {
      const a = iso(-0.5, i - 0.5);
      g.lineBetween(a.x, a.y, a.x, a.y - WALL_H);
      const b = iso(i - 0.5, -0.5);
      g.lineBetween(b.x, b.y, b.x, b.y - WALL_H);
    }
    // Listeling dinding.
    g.lineStyle(3, 0x1c2531, 0.9);
    g.lineBetween(leftEnd.x, leftEnd.y - 10, top.x, top.y - 10);
    g.lineBetween(rightEnd.x, rightEnd.y - 10, top.x, top.y - 10);
  }

  drawFloor() {
    const g = this.add.graphics().setDepth(0);

    // Alas karpet seluruh ruangan.
    const a = iso(-0.5, -0.5);
    const b = iso(COLS - 0.5, -0.5);
    const c = iso(COLS - 0.5, ROWS - 0.5);
    const d = iso(-0.5, ROWS - 0.5);
    g.fillStyle(0x39434f, 1);
    fillQuad(g, [a, b, c, d]);

    // Zona khusus: lantai kayu ruang meeting, keramik pantry, rak server, lounge.
    const zone = (c0, r0, c1, r1, color, alpha = 1) => {
      g.fillStyle(color, alpha);
      const p0 = iso(c0 - 0.5, r0 - 0.5);
      const p1 = iso(c1 + 0.5, r0 - 0.5);
      const p2 = iso(c1 + 0.5, r1 + 0.5);
      const p3 = iso(c0 - 0.5, r1 + 0.5);
      fillQuad(g, [p0, p1, p2, p3]);
    };

    zone(0, 0, 7, 6, 0x6b4a34);
    zone(0, 0, 7, 6, 0x8a5f3d, 0.35);
    zone(27, 0, 33, 5, 0x7b848e);
    zone(0, 9, 4, 16, 0x2b333d);
    zone(28, 18, 33, 23, 0x5d4a3d);
    zone(0, 20, 5, 23, 0x4a5058);

    // Jahitan karpet (lembut, tidak seperti grid pabrik).
    g.lineStyle(1, 0x424c59, 0.45);
    for (let i = 0; i <= COLS; i++) {
      const p = iso(i, 0);
      const q = iso(i, ROWS);
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
    for (let j = 0; j <= ROWS; j++) {
      const p = iso(0, j);
      const q = iso(COLS, j);
      g.lineBetween(p.x, p.y, q.x, q.y);
    }

    // Karpet area kerja (workspace pod) dengan warna sedikit berbeda.
    for (const [pc, pr] of PODS) {
      const p0 = iso(pc - 0.8, pr - 0.8);
      const p1 = iso(pc + 4.0, pr - 0.8);
      const p2 = iso(pc + 4.0, pr + 4.0);
      const p3 = iso(pc - 0.8, pr + 4.0);
      g.fillStyle(0x424c5a, 0.55);
      fillQuad(g, [p0, p1, p2, p3]);
    }

    // Karpet koridor sepanjang depan area kerja.
    zone(6, 21.6, 27, 23.6, 0x3b4657, 0.75);
    zone(6, 21.6, 27, 23.6, 0x4b5a6e, 0.25);
  }

  // Dinding pembatas kubikel (panel kaca) mengelilingi tiap pod.
  drawPartitions() {
    const H = 30;
    for (const [pc, pr] of PODS) {
      const g = this.add.graphics();
      const c0 = pc - 0.85;
      const r0 = pr - 0.85;
      const c1 = pc + 4.05;
      const r1 = Math.min(pr + 4.05, FRONT_CORRIDOR_R);
      const panel = (p0, p1) => {
        const quad = toPoints([
          p0.x, p0.y, p1.x, p1.y,
          p1.x, p1.y - H, p0.x, p0.y - H,
        ]);
        g.fillStyle(0x8fb6d9, 0.16);
        g.fillPoints(quad, true);
        g.lineStyle(2, 0x51637a, 0.85);
        g.strokePoints(quad, true, true);
        g.lineStyle(3, 0x6d8299, 0.95);
        g.lineBetween(p0.x, p0.y - H, p1.x, p1.y - H);
      };
      panel(iso(c0, r0), iso(c0, r1));
      panel(iso(c0, r0), iso(c1, r0));
      g.setDepth(iso(c0, r0).y);
    }
  }

  // Perabot kantor tambahan: area diskusi, mesin fotokopi, rak majalah.
  drawOfficeProps() {
    const g = this.add.graphics();

    // Area diskusi: meja bulat + stool di sisi kanan kantor.
    const dt = iso(30.0, 12.0);
    g.fillStyle(0x6d4c41, 1);
    g.fillEllipse(dt.x, dt.y - 4, 56, 28);
    g.fillStyle(0x9c7b5c, 1);
    g.fillEllipse(dt.x, dt.y - 22, 56, 28);
    g.fillStyle(0x546e7a, 1);
    g.fillRect(dt.x - 3, dt.y - 22, 6, 20);
    for (const [sx, sy] of [[28.4, 11.0], [31.4, 11.2], [28.6, 13.4], [31.6, 13.0]]) {
      const sp = iso(sx, sy);
      g.fillStyle(0x78909c, 1);
      g.fillEllipse(sp.x, sp.y - 11, 19, 10);
      g.fillStyle(0x455a64, 1);
      g.fillRect(sp.x - 2, sp.y - 11, 4, 11);
    }

    // Mesin fotokopi di dekat koridor.
    isoBox(g, 28.4, 6.4, 1.4, 1.1, 30, 0xcfd8dc, 0x90a4ae, 0x71838f);
    const tray = iso(30.4, 6.6);
    g.fillStyle(0xb0bec5, 1);
    g.fillRect(tray.x - 10, tray.y - 14, 20, 14);
    g.fillStyle(0x546e7a, 1);
    g.fillRect(tray.x - 8, tray.y - 11, 16, 4);

    // Rak majalah di dekat lounge.
    isoBox(g, 27.2, 16.4, 0.7, 2.2, 32, 0x6d4c41, 0x5d4037, 0x4e342e);
    for (let i = 0; i < 5; i++) {
      const bk = iso(27.5, 16.7 + i * 0.4);
      g.fillStyle([0xe74c3c, 0x3498db, 0xf1c40f, 0x1abc9c, 0xe8eef5][i], 0.9);
      g.fillRect(bk.x - 3, bk.y - 28, 6, 9);
    }

    const lab = iso(30.0, 15.0);
    this.add
      .text(lab.x, lab.y, "AREA DISKUSI", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#9fd3b0",
      })
      .setOrigin(0.5)
      .setDepth(1);
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
    const g = this.add.graphics().setDepth(216);

    // Karpet ruang meeting.
    const p0 = iso(0.4, 0.4);
    const p1 = iso(6.6, 0.4);
    const p2 = iso(6.6, 5.6);
    const p3 = iso(0.4, 5.6);
    g.fillStyle(0x3d4f63, 0.9);
    fillQuad(g, [p0, p1, p2, p3]);

    // Meja panjang.
    isoBox(g, 1.4, 2.0, 4.0, 2.4, 15, 0x9c7b5c, 0x6d4c41, 0x513a2c);

    // Laptop di meja + tempatMinimum.
    const lp = iso(3.0, 3.0);
    g.fillStyle(0x22303f, 1);
    g.fillPoints(
      toPoints([lp.x - 9, lp.y - 8, lp.x + 9, lp.y - 8, lp.x + 7, lp.y - 18, lp.x - 7, lp.y - 18]),
      true
    );
    g.fillStyle(0x0f1620, 1);
    g.fillPoints(
      toPoints([lp.x - 7, lp.y - 10, lp.x + 7, lp.y - 10, lp.x + 5, lp.y - 16, lp.x - 5, lp.y - 16]),
      true
    );

    // Kursi rapat.
    for (const spec of [
      [2.2, 1.1], [3.6, 1.1], [5.0, 1.1],
      [2.2, 5.4], [3.6, 5.4], [5.0, 5.4],
    ]) {
      drawMeetingChair(this, spec[0], spec[1]);
    }

    // Layar presentasi di dinding.
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

    // Whiteboard di dinding.
    this.drawWallPanel(-0.5, 5.4, 7.4, 14, 40, 0xe8eef5, 0x8fa3b8);
    const wb = this.add.graphics().setDepth(-93);
    wb.lineStyle(2, 0x3498db, 0.75);
    wb.lineBetween(iso(-0.5, 5.9).x, iso(-0.5, 5.9).y - 30, iso(-0.5, 6.9).x, iso(-0.5, 6.9).y - 26);
    wb.lineBetween(iso(-0.5, 5.9).x, iso(-0.5, 5.9).y - 24, iso(-0.5, 6.6).x, iso(-0.5, 6.6).y - 21);
    wb.fillStyle(0xe74c3c, 0.8);
    wb.fillCircle(iso(-0.5, 7.0).x, iso(-0.5, 7.0).y - 22, 2.5);

    const lab = iso(2.6, 6.6);
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

    // Meja pantry panjang di sepanjang dinding.
    isoBox(g, 27.4, 0.2, 3.2, 1.1, 26, 0x9c7b5c, 0x6d4c41, 0x513a2c);

    // Mesin kopi.
    const mc = iso(28.2, 0.7);
    g.fillStyle(0x37474f, 1);
    g.fillRect(mc.x - 9, mc.y - 24, 18, 22);
    g.fillStyle(0x90a4ae, 1);
    g.fillRect(mc.x - 7, mc.y - 22, 14, 6);
    g.fillStyle(0xe74c3c, 1);
    g.fillCircle(mc.x - 4, mc.y - 8, 1.6);
    g.fillStyle(0x2ecc71, 1);
    g.fillCircle(mc.x + 1, mc.y - 8, 1.6);

    // Wastafel.
    const sk = iso(29.6, 0.7);
    g.fillStyle(0xb0bec5, 1);
    g.fillEllipse(sk.x, sk.y - 5, 22, 11);
    g.fillStyle(0x546e7a, 1);
    g.fillEllipse(sk.x, sk.y - 5, 16, 7);
    g.lineStyle(2, 0xcfd8dc, 1);
    g.lineBetween(sk.x, sk.y - 5, sk.x, sk.y - 18);
    g.lineBetween(sk.x, sk.y - 18, sk.x + 6, sk.y - 18);

    // Kulkas.
    isoBox(g, 30.9, 1.5, 0.9, 0.9, 34, 0x90a4ae, 0x546e7a, 0x455a64);

    // Meja tinggi + stool.
    const hp = iso(28.0, 3.2);
    g.fillStyle(0x6d4c41, 1);
    g.fillEllipse(hp.x, hp.y, 34, 17);
    g.fillStyle(0x8d6e63, 1);
    g.fillEllipse(hp.x, hp.y - 24, 34, 17);
    g.fillStyle(0x546e7a, 1);
    g.fillRect(hp.x - 3, hp.y - 24, 6, 24);
    for (const [sx, sy] of [[27.4, 3.6], [28.8, 4.0]]) {
      const sp = iso(sx, sy);
      g.fillStyle(0x78909c, 1);
      g.fillEllipse(sp.x, sp.y - 12, 20, 10);
      g.fillStyle(0x546e7a, 1);
      g.fillRect(sp.x - 2, sp.y - 12, 4, 12);
    }

    // Water dispenser.
    const wd = iso(32.0, 3.0);
    g.fillStyle(0xe8eef5, 1);
    g.fillRect(wd.x - 7, wd.y - 26, 14, 26);
    g.fillStyle(0x3498db, 1);
    g.fillRect(wd.x - 5, wd.y - 22, 10, 9);

    const lab = iso(29.5, 5.0);
    this.add
      .text(lab.x, lab.y, "PANTRY", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e0b860",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawServerRoom() {
    const g = this.add.graphics().setDepth(300);

    // Rak server berderet di tepi kiri.
    const rackSpots = [
      [0.5, 9.6], [0.5, 11.2], [0.5, 12.8], [0.5, 14.4],
    ];
    for (const [c, r] of rackSpots) {
      isoBox(g, c, r, 1.0, 1.2, 46, 0x37474f, 0x263238, 0x1c252b);
      const p = iso(c + 1.0, r + 0.6);
      for (let i = 0; i < 8; i++) {
        g.fillStyle(i % 3 === 0 ? 0x2ecc71 : 0x1e88e5, 0.9);
        g.fillCircle(p.x - 6 + (i % 4) * 4, p.y - 40 + Math.floor(i / 4) * 9, 1.4);
      }
      g.fillStyle(0x1b2532, 0.9);
      g.fillRect(p.x - 8, p.y - 36, 16, 3);
    }

    // Patch panel di dinding.
    this.drawWallPanel(-0.5, 9.4, 12.4, 20, 52, 0x263238, 0x455a64);

    // Kabel di lantai.
    g.lineStyle(2, 0x37474f, 0.8);
    const c0 = iso(1.6, 9.8);
    const c1 = iso(1.6, 15.0);
    g.lineBetween(c0.x, c0.y, c1.x, c1.y);

    const lab = iso(2.2, 16.4);
    this.add
      .text(lab.x, lab.y, "RACK SERVER", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#7fd1e8",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawLounge() {
    const g = this.add.graphics().setDepth(340);

    // Karpet lounge.
    const p0 = iso(28.0, 18.0);
    const p1 = iso(33.5, 18.0);
    const p2 = iso(33.5, 23.5);
    const p3 = iso(28.0, 23.5);
    g.fillStyle(0x7a5f49, 0.9);
    fillQuad(g, [p0, p1, p2, p3]);

    // Sofa.
    isoBox(g, 28.6, 18.6, 0.9, 2.6, 12, 0x4f6d8a, 0x3c5470, 0x2e4257);
    isoBox(g, 28.6, 18.6, 0.9, 2.6, 22, 0x5b7ea3, 0x3c5470, 0x2e4257);

    // Meja kopi.
    isoBox(g, 30.2, 19.4, 0.8, 1.4, 10, 0x9c7b5c, 0x6d4c41, 0x513a2c);

    // Rak buku.
    isoBox(g, 32.6, 18.4, 0.9, 0.8, 40, 0x6d4c41, 0x5d4037, 0x4e342e);
    const bk = iso(33.1, 18.8);
    g.fillStyle(0xe74c3c, 1);
    g.fillRect(bk.x - 8, bk.y - 34, 4, 10);
    g.fillStyle(0x3498db, 1);
    g.fillRect(bk.x - 3, bk.y - 34, 4, 10);
    g.fillStyle(0xf1c40f, 1);
    g.fillRect(bk.x + 2, bk.y - 34, 4, 10);

    // Lampu lantai.
    const lp = iso(33.0, 22.0);
    g.fillStyle(0x455a64, 1);
    g.fillRect(lp.x - 2, lp.y - 34, 4, 34);
    g.fillStyle(0xf5f7fa, 1);
    g.fillPoints(
      toPoints([lp.x - 9, lp.y - 34, lp.x + 9, lp.y - 34, lp.x + 5, lp.y - 44, lp.x - 5, lp.y - 44]),
      true
    );

    const lab = iso(30.0, 23.6);
    this.add
      .text(lab.x, lab.y, "LOUNGE", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#e6b98a",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawReception() {
    const g = this.add.graphics().setDepth(320);

    // Meja resepsionis.
    isoBox(g, 1.0, 20.4, 2.6, 1.0, 28, 0x9c7b5c, 0x6d4c41, 0x513a2c);

    // Monitor resepsionis.
    const p = iso(1.8, 20.6);
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(p.x - 9, p.y - 30, 18, 12, 2);
    g.fillStyle(0x111a24, 1);
    g.fillRoundedRect(p.x - 7, p.y - 28, 14, 8, 1);

    // Papan nama.
    const s = iso(3.0, 20.9);
    g.fillStyle(0xe8eef5, 1);
    g.fillRoundedRect(s.x - 14, s.y - 22, 28, 12, 2);
    g.fillStyle(0x3498db, 1);
    g.fillRect(s.x - 11, s.y - 19, 14, 2);
    g.fillRect(s.x - 11, s.y - 15, 9, 2);

    const lab = iso(3.4, 22.4);
    this.add
      .text(lab.x, lab.y, "RESEPSIONIS", {
        fontFamily: "monospace",
        fontSize: "11px",
        color: "#a8c6e8",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  drawDecor() {
    drawWallClock(this, iso(6.5, -0.5));

    // Poster di dinding kanan.
    this.drawWallPanel(-0.5, 13.4, 16.4, 16, 50, 0x2f3f52, 0x4a6280);
    const pp = iso(-0.5, 14.0);
    const pg = this.add.graphics().setDepth(-92);
    pg.fillStyle(0x2ecc71, 0.85);
    pg.fillCircle(pp.x, pp.y - 36, 5);
    pg.fillStyle(0xe8eef5, 0.8);
    pg.fillRect(pp.x - 8, pp.y - 26, 16, 3);

    // Tanaman di sudut ruangan.
    drawPlant(this, iso(0, 0).x, iso(0, 0).y + 2);
    drawPlant(this, iso(0, 23).x + 6, iso(0, 23).y);
    drawPlant(this, iso(6, 23).x, iso(6, 23).y);
    drawPlant(this, iso(33.5, 4.5).x, iso(33.5, 4.5).y);
    drawPlant(this, iso(6.5, 17.5).x, iso(6.5, 17.5).y);
    drawPlant(this, iso(33.5, 11.5).x, iso(33.5, 11.5).y);
  }

  // Pintu masuk di tepi depan ruangan, dekat resepsionis.
  drawEntrance() {
    const a = iso(3.1, 23.4);
    const b = iso(5.5, 23.4);
    const H = 58;
    const g = this.add.graphics();
    g.lineStyle(5, 0x41576f, 1);
    g.lineBetween(a.x, a.y, a.x, a.y - H);
    g.lineBetween(b.x, b.y, b.x, b.y - H);
    g.lineBetween(a.x, a.y - H, b.x, b.y - H);
    g.lineStyle(2, 0x6d8299, 0.55);
    g.lineBetween(a.x + 7, a.y - H + 7, b.x - 7, b.y - H + 7);

    // Mat pintu.
    const m0 = iso(3.3, 22.9);
    const m1 = iso(5.3, 22.9);
    const m2 = iso(5.3, 23.8);
    const m3 = iso(3.3, 23.8);
    g.fillStyle(0x2c3e50, 0.85);
    fillQuad(g, [m0, m1, m2, m3]);
    g.lineStyle(1, 0x566a82, 0.7);
    g.strokePoints(
      toPoints([m0.x, m0.y, m1.x, m1.y, m2.x, m2.y, m3.x, m3.y]),
      true,
      true
    );
    g.setDepth(iso(3.1, 23.4).y + 120);

    const lab = iso(4.3, 24.4);
    this.add
      .text(lab.x, lab.y, "PINTU", {
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#8fa9c4",
      })
      .setOrigin(0.5)
      .setDepth(1);
  }

  // --- Peta jalan (tembok, partisi, perabot) -----------------------------

  buildNav() {
    const nav = new NavGrid(COLS, ROWS);

    // Dinding partisi kubikel: sisi c0 dan r0 tiap pod.
    for (const [pc, pr] of PODS) {
      const c0 = pc - 0.85;
      const r0 = pr - 0.85;
      const c1 = pc + 4.05;
      const r1 = Math.min(pr + 4.05, FRONT_CORRIDOR_R);
      nav.addLine(c0, r0, c0, r1);
      nav.addLine(c0, r0, c1, r0);
    }

    // Meja kerja (termasuk meja master).
    for (const slot of this.slots) {
      nav.addRect(slot.c - 0.5, slot.r - 0.4, slot.c + 0.5, slot.r + 0.55);
    }
    nav.addRect(
      MASTER_SLOT.c - 0.5,
      MASTER_SLOT.r - 0.4,
      MASTER_SLOT.c + 0.5,
      MASTER_SLOT.r + 0.55
    );

    // Ruang meeting: meja panjang.
    nav.addRect(1.4, 2.0, 5.4, 4.4);

    // Pantri: meja panjang, kulkas, mesin kopi, wastafel, meja tinggi, dispenser.
    nav.addRect(27.4, 0.2, 30.6, 1.3);
    nav.addRect(30.9, 1.5, 31.8, 2.4);
    nav.addRect(27.95, 0.45, 28.5, 0.95);
    nav.addRect(29.35, 0.45, 29.85, 0.95);
    nav.addRect(27.65, 2.85, 28.35, 3.55);
    nav.addRect(31.75, 2.75, 32.25, 3.25);

    // Server rack, fotokopi, rak majalah.
    nav.addRect(0.5, 9.6, 1.5, 10.8);
    nav.addRect(0.5, 11.2, 1.5, 12.4);
    nav.addRect(0.5, 12.8, 1.5, 14.0);
    nav.addRect(0.5, 14.4, 1.5, 15.6);
    nav.addRect(28.4, 6.4, 29.8, 7.5);
    nav.addRect(27.2, 16.4, 27.9, 18.6);

    // Meja resepsionis.
    nav.addRect(1.0, 20.4, 3.6, 21.4);

    // Lounge: sofa, meja kopi, rak buku.
    nav.addRect(28.6, 18.6, 29.5, 21.2);
    nav.addRect(30.2, 19.4, 31.0, 20.8);
    nav.addRect(32.6, 18.4, 33.5, 19.2);

    // Area diskusi: meja bulat.
    nav.addRect(29.6, 11.7, 30.4, 12.3);

    // Tanaman di sudut ruangan.
    nav.addRect(-0.2, -0.2, 0.2, 0.2);
    nav.addRect(-0.2, 22.8, 0.2, 23.2);
    nav.addRect(5.8, 22.8, 6.2, 23.2);
    nav.addRect(33.3, 4.3, 33.7, 4.7);
    nav.addRect(6.3, 17.3, 6.7, 17.7);
    nav.addRect(33.3, 11.3, 33.7, 11.7);

    nav.build();
    this.nav = nav;
  }

  // Jalur (piksel dunia) dari posisi sekarang ke titik (c, r).
  pathTo(fromX, fromY, c, r, exactGoal = false) {
    const from = gridOf(fromX, fromY);
    const cells = this.nav.findPath(from, { c, r }, exactGoal);
    if (!cells || cells.length < 2) {
      // Tidak ada jalur: berhenti di sel bebas terdekat, jangan menembus objek.
      const alt = this.nav.nearestFree(Math.floor(c), Math.floor(r));
      if (!alt) return [{ x: fromX, y: fromY }];
      return [{ x: fromX, y: fromY }, iso(alt.c + 0.5, alt.r + 0.5)];
    }
    return cells.map((p) => iso(p.c, p.r));
  }

  // Durasi jalan diperpanjang bila jalur memutar (menjaga kecepatan langkah).
  pathDuration(path, requested) {
    if (!path || path.length < 2) return requested;
    const straight = Phaser.Math.Distance.BetweenPoints(path[0], path[path.length - 1]);
    if (straight < 1) return requested;
    let length = 0;
    for (let i = 1; i < path.length; i++) {
      length += Phaser.Math.Distance.BetweenPoints(path[i - 1], path[i]);
    }
    const scale = Math.min(2.8, Math.max(1, length / straight));
    return Math.max(300, requested * scale);
  }

  // Cek konektivitas jalur antar titik penting (dipakai untuk debug).
  navCheck() {
    const spots = {
      pintu: ENTRANCE,
      resepsionis: RECEPTION_STATION,
      depanMeja: RECEPTION_FRONT,
      pantri: PANTRY_SPOT,
      kopi: PANTRY_COFFEE,
      master: MASTER_SLOT,
      kursiMaster: SEAT_MASTER,
      kursiTamu: SEAT_GUEST,
      lounge: { c: 30.6, r: 20.8 },
      diskusi: { c: 29.2, r: 13.4 },
    };
    const clean = CLEAN_SPOTS.map((s, i) => [`clean${i}`, s]);
    const brk = [COFFEE_SPOT, ...CHAT_SEATS].map((s, i) => [`break${i}`, s]);
    const all = { ...spots, ...Object.fromEntries(clean), ...Object.fromEntries(brk) };
    const report = [];
    for (const [name, to] of Object.entries(all)) {
      const from = name === "pintu" ? RECEPTION_FRONT : MASTER_SLOT;
      const cells = this.nav.findPath(gridOf(iso(from.c, from.r).x, iso(from.c, from.r).y), to);
      report.push({ name, ok: !!cells, len: cells ? cells.length : 0 });
    }
    // Semua kursi meja kerja harus bisa dijangkau dari koridor.
    for (const slot of this.slots) {
      const cells = this.nav.findPath(gridOf(iso(12, 22).x, iso(12, 22).y), slot);
      report.push({ name: `slot ${slot.c.toFixed(1)},${slot.r.toFixed(1)}`, ok: !!cells, len: cells ? cells.length : 0 });
    }
    return report;
  }

  // --- NPC ----------------------------------------------------------------

  createNpcs() {
    this.officeBoy = new Actor(this, "office-boy", {
      kind: "officeboy",
      shirt: 0x3f6fb5,
      prop: "mop",
      tag: "office boy",
    });
    this.officeBoy.spawn(29.4, 2.6);
    this.npcs.push(this.officeBoy);
    this.runOfficeBoy(this.officeBoy);

    this.receptionist = new Actor(this, "resepsionis", {
      kind: "receptionist",
      shirt: 0x8e5bb7,
      tag: "resepsionis",
    });
    // Berdiri di belakang meja resepsionis (depth di bawah meja).
    this.receptionist.depthBias = -140;
    this.receptionist.spawn(RECEPTION_STATION.c, RECEPTION_STATION.r);
    this.npcs.push(this.receptionist);
    this.runReceptionist(this.receptionist);

    // Tamu datang sesekali.
    this.time.addEvent({
      delay: GUEST_FIRST,
      callback: () => this.guestScheduler(),
    });
  }

  // Office boy: bersihkan beberapa titik, sesekali santai di pantri.
  async runOfficeBoy(boy) {
    while (boy.alive) {
      const rounds = Phaser.Math.Between(2, 4);
      for (let i = 0; i < rounds; i++) {
        if (!boy.alive) return;
        const spot = Phaser.Utils.Array.GetRandom(CLEAN_SPOTS);
        await boy.walkTo(spot.c, spot.r, 2400);
        await boy.clean(Phaser.Math.Between(2600, 5000));
      }
      if (!boy.alive) return;

      // Santai di pantri.
      await boy.walkTo(PANTRY_SPOT.c, PANTRY_SPOT.r, 2800);
      boy.say("istirahat sebentar", 2600);
      await this.wait(Phaser.Math.Between(9000, 16000));
      await boy.walkTo(PANTRY_COFFEE.c, PANTRY_COFFEE.r, 900);
      boy.say("kopi dulu", 2400);
      await this.wait(5000);
    }
  }

  // Resepsionis: menyapa tamu, sesekali ambil kopi.
  async runReceptionist(rec) {
    while (rec.alive) {
      await this.wait(Phaser.Math.Between(RECEPTION_IDLE_MIN, RECEPTION_IDLE_MAX));
      if (!rec.alive) return;
      if (this.guests.length) continue;
      if (Math.random() < RECEPTION_BREAK_CHANCE) {
        rec.away = true;
        rec.say("ambil kopi dulu", 2400);
        await rec.walkTo(PANTRY_COFFEE.c, PANTRY_COFFEE.r, 2800);
        await this.wait(
          Phaser.Math.Between(RECEPTION_BREAK_HOLD_MIN, RECEPTION_BREAK_HOLD_MAX)
        );
        await rec.walkTo(RECEPTION_STATION.c, RECEPTION_STATION.r, 2800);
        rec.away = false;
      } else {
        rec.say("selamat datang!", 2600);
      }
    }
  }

  greetGuest() {
    if (this.receptionist) this.receptionist.say("halo, selamat datang!", 3000);
  }

  async guestScheduler() {
    while (true) {
      await this.wait(Phaser.Math.Between(GUEST_INTERVAL_MIN, GUEST_INTERVAL_MAX));
      if (this.guests.length >= 2) continue;
      this.spawnGuest();
    }
  }

  async spawnGuest() {
    const no = ++this.guestCounter;
    const guest = new Actor(this, `tamu-${no}`, {
      kind: "guest",
      shirt: pick(SHIRTS, `tamu-${no}`, 3),
      prop: "tas",
      tag: "tamu",
    });
    this.guests.push(guest);
    guest.spawn(ENTRANCE.c, ENTRANCE.r);

    await guest.walkTo(RECEPTION_FRONT.c, RECEPTION_FRONT.r, 2800);
    let guard = 0;
    while (this.receptionist.away && guard++ < 60) await this.wait(500);
    this.greetGuest();
    guest.say("halo, saya ada janji", 3200);
    await this.wait(3400);

    const seat = this.findGuestSeat();
    await guest.walkTo(seat.c, seat.r, 3200);
    await this.wait(Phaser.Math.Between(14000, 28000));
    guest.say("pamit dulu ya", 2400);
    await this.wait(2400);
    await guest.walkTo(ENTRANCE.c, ENTRANCE.r, 3200);
    guest.destroy();
    this.guests = this.guests.filter((g) => g !== guest);
  }

  // Kursi tamu: meja yang kosong, kadang sofa lounge.
  findGuestSeat() {
    const free = this.slots.slice(this.order.length);
    if (free.length && Math.random() < 0.6) {
      const slot = Phaser.Utils.Array.GetRandom(free);
      return { c: slot.c, r: slot.r + 1.5 };
    }
    return { c: 30.6, r: 20.8 };
  }

  // Bantuan debugging dari console: paksa karyawan keluar / panggil tamu.
  forceBreak(id) {
    const desk = this.desks[id];
    if (!desk) return false;
    this.takeCoffeeBreak(desk);
    return true;
  }

  spawnGuestNow() {
    this.spawnGuest();
  }

  // --- Istirahat -------------------------------------------------------

  // Karyawan hanya istirahat setelah menganggur beberapa menit.
  checkBreaks() {
    const now = this.time.now;
    if (now < this.nextBreakAllowedAt) return;
    const away = Object.values(this.desks).filter((d) => d.onBreak).length;
    if (away >= MAX_AWAY) return;

    const idle = Object.values(this.desks).filter(
      (d) => d.state === "IDLE" && !d.onBreak && !d.travelling
    );
    if (!idle.length) return;

    const ready = [];
    for (const desk of idle) {
      if (!desk.nextBreakAt) {
        desk.nextBreakAt =
          desk.idleSince + Phaser.Math.Between(BREAK_AFTER_MIN, BREAK_AFTER_MAX);
      }
      if (now >= desk.nextBreakAt) ready.push(desk);
    }
    if (!ready.length) return;

    const first = Phaser.Utils.Array.GetRandom(ready);
    const partner = ready.find((d) => d !== first);
    if (partner && Math.random() < CHAT_CHANCE) {
      this.takeChatBreak(first, partner);
    } else {
      this.takeCoffeeBreak(first);
    }
  }

  startBreak(desk, label) {
    if (desk.onBreak || desk.travelling) return 0;
    desk.onBreak = true;
    desk.nextBreakAt = 0;
    desk.setAway(true, label);
    this.nextBreakAllowedAt =
      this.time.now + Phaser.Math.Between(BREAK_SPACING_MIN, BREAK_SPACING_MAX);
    return ++desk.breakToken;
  }

  async finishBreak(desk, token, duration) {
    if (desk.breakToken !== token) return;
    await desk.goHome(duration);
    if (desk.breakToken !== token) return;
    desk.onBreak = false;
    desk.setAway(false);
    desk.idleSince = this.time.now;
    desk.nextBreakAt = 0;
  }

  async takeCoffeeBreak(desk) {
    const token = this.startBreak(desk, "ngopi");
    if (!token) return;
    await desk.travel(COFFEE_SPOT.c, COFFEE_SPOT.r, 3400);
    if (desk.breakToken !== token) return;
    await this.wait(Phaser.Math.Between(COFFEE_BREAK_MIN, COFFEE_BREAK_MAX));
    await this.finishBreak(desk, token, 3400);
  }

  async takeChatBreak(a, b) {
    const tokenA = this.startBreak(a, "ngobrol");
    if (!tokenA) return;
    const tokenB = this.startBreak(b, "ngobrol");
    if (!tokenB) {
      await this.finishBreak(a, tokenA, 3400);
      return;
    }
    await Promise.all([
      a.travel(CHAT_SEATS[0].c, CHAT_SEATS[0].r, 3400),
      b.travel(CHAT_SEATS[1].c, CHAT_SEATS[1].r, 3400),
    ]);
    await this.wait(Phaser.Math.Between(CHAT_BREAK_MIN, CHAT_BREAK_MAX));
    await Promise.all([
      this.finishBreak(a, tokenA, 3400),
      this.finishBreak(b, tokenB, 3400),
    ]);
  }

  // Tugas baru datang -> karyawan yang sedang istirahat langsung kembali.
  cancelBreak(desk) {
    if (!desk.onBreak) return;
    desk.breakToken++;
    desk.onBreak = false;
    desk.setAway(false);
    desk.idleSince = this.time.now;
    desk.nextBreakAt = 0;
    desk.goHome(2400);
  }

  strollRandom() {
    const idle = Object.values(this.desks).filter((d) => d.state === "IDLE" && !d.onBreak);
    if (idle.length) Phaser.Utils.Array.GetRandom(idle).stroll();
  }

  addDesk(id, label, isMaster = undefined) {
    if (!id) return null;
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
      const p = iso(MASTER_SLOT.c, MASTER_SLOT.r);
      master.setPosition(p.x, p.y);
      if (!master.travelling) master.setDepth(p.y);
      master.syncLabel();
    }

    const ids = this.order;
    for (let i = 0; i < ids.length; i++) {
      const desk = this.desks[ids[i]];
      if (!desk) continue;
      const slot = this.slots[i % this.slots.length];
      const overflow = Math.floor(i / this.slots.length);
      const p = iso(slot.c + overflow * 0.6, slot.r + overflow * 0.6);
      desk.setPosition(p.x, p.y);
      if (!desk.travelling) desk.setDepth(p.y);
      desk.syncLabel();
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
    if (!guest) return;
    if (master.onBreak) this.cancelBreak(master);
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
    const desk = this.addDesk(agentId, role);
    if (!desk) return;
    // Tugas baru = karyawan yang sedang istirahat harus kembali ke meja.
    if (state !== "IDLE" && desk.onBreak) this.cancelBreak(desk);
    desk.setState(state, task, progress);
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
          if (guest) this.startMeeting(guest, data.task);
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
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
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
