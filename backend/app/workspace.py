import json
import os
import re
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = Path(os.getenv("STUDIO_OUTPUT") or (REPO_ROOT / "output"))


def slugify(text: str, max_len: int = 48) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (slug[:max_len].rstrip("-")) or "proyek"


def make_project_dir(prompt: str) -> tuple[Path, str]:
    """Buat folder output/<nama-proyek>/ (unik) dan kembalikan (path, slug relatif)."""
    slug = slugify(prompt)
    folder = OUTPUT_ROOT / slug
    n = 2
    while folder.exists():
        folder = OUTPUT_ROOT / f"{slug}-{n}"
        n += 1
    folder.mkdir(parents=True, exist_ok=True)
    return folder, folder.name


def asset_filename(agent_id: str, index: int | None = None) -> str:
    prefix = f"{index:02d}-" if index is not None else ""
    return f"{prefix}{slugify(agent_id)}.md"


def build_asset_text(role: str, agent_id: str, task: str, prompt: str, body: str) -> str:
    created = time.strftime("%Y-%m-%d %H:%M:%S")
    return (
        f"# {role}\n\n"
        f"- Proyek: {prompt}\n"
        f"- Divisi: `{agent_id}`\n"
        f"- Tugas: {task}\n"
        f"- Dibuat: {created}\n\n"
        f"---\n\n"
        f"{body.strip()}\n"
    )


def relative_to_output(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


ANIMATION_FILENAME = "animasi.html"


def read_project_files(project_dir: Path) -> dict[str, str]:
    """Baca semua file rancangan (*.md) suatu proyek: {nama tanpae-ekstensi: isi}."""
    files: dict[str, str] = {}
    for path in sorted(project_dir.glob("*.md")):
        try:
            files[path.stem] = path.read_text(encoding="utf-8")
        except OSError:
            continue
    return files


def list_projects() -> list[dict]:
    """Daftar proyek di folder output beserta status file & animasinya."""
    if not OUTPUT_ROOT.exists():
        return []
    projects = []
    for folder in sorted(OUTPUT_ROOT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not folder.is_dir():
            continue
        anim = folder / ANIMATION_FILENAME
        projects.append(
            {
                "slug": folder.name,
                "dir": relative_to_output(folder),
                "files": [p.name for p in sorted(folder.glob("*.md"))],
                "animation": relative_to_output(anim) if anim.exists() else None,
            }
        )
    return projects


def fallback_animation_html(prompt: str, files: dict[str, str]) -> str:
    """Animasi HTML mandiri sederhana sebagai cadangan bila LLM gagal."""
    panels = "".join(
        f"<li><strong>{name}</strong><p>{html_escape(text[:280])}</p></li>" for name, text in files.items()
    )
    return (
        "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"UTF-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
        f"<title>Animasi - {html_escape(prompt)}</title>\n"
        "<style>body{margin:0;font-family:system-ui,sans-serif;background:#1b2430;color:#ecf0f1}"
        ".stage{position:relative;height:340px;background:#0f1620;overflow:hidden}"
        ".ball{position:absolute;left:10%;bottom:40px;width:40px;height:40px;border-radius:50%;"
        "background:radial-gradient(circle at 35% 30%,#fff,#c9d1d9);animation:kick 2.4s ease-in-out infinite}"
        "@keyframes kick{0%{left:10%;bottom:40px}45%{left:55%;bottom:150px}100%{left:92%;bottom:70px}}"
        ".title{position:absolute;top:16px;left:20px;font-weight:700}"
        "ul{padding:16px 24px}li{margin-bottom:12px}p{margin:4px 0;color:#9fb3c8;font-size:13px}</style>\n"
        "</head>\n<body>\n"
        f"<div class=\"stage\"><div class=\"title\">{html_escape(prompt)}</div><div class=\"ball\"></div></div>\n"
        f"<ul>{panels}</ul>\n</body>\n</html>\n"
    )


ANIMATION_TEMPLATE = """<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__JUDUL__</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px; padding: 20px;
    background: #0f1620; color: #ecf0f1;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  header { text-align: center; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #9fb3c8; font-size: 12px; margin-top: 4px; }
  canvas { width: min(90vw, 800px); height: auto; border-radius: 12px;
    box-shadow: 0 12px 30px rgba(0,0,0,.45); background: #000; }
  .bar { display: flex; align-items: center; gap: 10px; width: min(90vw, 800px); }
  button { background: #2ecc71; color: #0f1620; border: 0; border-radius: 8px;
    padding: 8px 16px; font-weight: 700; cursor: pointer; }
  button.sec { background: #34495e; color: #ecf0f1; }
  #caption { color: #cbd5e1; font-size: 13px; margin-left: auto; text-align: right; }
</style>
</head>
<body>
<header>
  <h1>__JUDUL__</h1>
  <div class="sub">__PROMPT__</div>
</header>
<canvas id="cv" width="800" height="450"></canvas>
<div class="bar">
  <button id="toggle">Jeda</button>
  <button id="replay" class="sec">Ulangi</button>
  <span id="caption"></span>
</div>
<script>const SPEC = __SPEC__;</script>
<script>
(function () {
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d");
  const cap = document.getElementById("caption");
  const btnT = document.getElementById("toggle");
  const scenes = (SPEC.adegan && SPEC.adegan.length) ? SPEC.adegan : [{ durasi: 2, teks: "", posisi: {} }];
  const actors = SPEC.aktor || [];
  const decor = SPEC.dekor || [];
  const palet = SPEC.palet || {};
  const starts = [];
  let total = 0;
  for (const s of scenes) { starts.push(total); total += Math.max(0.2, s.durasi || 1); }
  let t = 0, playing = true, last = 0;

  function sceneIndex(time) {
    for (let i = scenes.length - 1; i >= 0; i--) if (time >= starts[i]) return i;
    return 0;
  }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function posMap(scene, id) { return (scene && scene.posisi && scene.posisi[id]) || null; }

  function drawEmoji(emoji, x, y, size) {
    ctx.font = size + "px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(emoji, x, y);
  }

  function drawActor(ax, x, y) {
    const r = ax.r || 16;
    const bentuk = ax.bentuk || "manusia";
    if (ax.emoji) { drawEmoji(ax.emoji, x, y, r * 2.4); return; }
    if (bentuk === "bola" || r <= 11) {
      ctx.fillStyle = ax.warna || "#fff";
      ctx.beginPath(); ctx.arc(x, y - r, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.45)"; ctx.lineWidth = 2; ctx.stroke();
      return;
    }
    if (bentuk === "hewan") {
      ctx.fillStyle = ax.warna || "#8d5524";
      ctx.beginPath(); ctx.ellipse(x, y - r * 1.1, r * 1.3, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 1.2, y - r * 1.9, r * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ax.warna || "#8d5524"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.5); ctx.lineTo(x - r * 0.7, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.5); ctx.lineTo(x + r * 0.7, y); ctx.stroke();
      return;
    }
    if (bentuk === "kendaraan" || bentuk === "benda" || bentuk === "bangunan" || bentuk === "tumbuhan") {
      ctx.fillStyle = ax.warna || "#e67e22";
      ctx.beginPath(); ctx.roundRect(x - r * 1.4, y - r * 1.8, r * 2.8, r * 1.8, 6); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.stroke();
      return;
    }
    ctx.strokeStyle = ax.warna || "#e74c3c";
    ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x, y - r * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x, y - r * 0.6); ctx.lineTo(x + r, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x - r, y - r * 0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - r * 1.8); ctx.lineTo(x + r, y - r * 0.9); ctx.stroke();
    ctx.fillStyle = "#f2c9a0";
    ctx.beginPath(); ctx.arc(x, y - r * 2.7, r * 0.7, 0, Math.PI * 2); ctx.fill();
  }

  function frame(now) {
    const dt = (now - last) / 1000 || 0; last = now;
    if (playing) t += dt;
    if (t >= total) { t = total; playing = false; btnT.textContent = "Putar"; }
    const idx = sceneIndex(t);
    const s = scenes[idx];
    const p = Math.max(0, Math.min(1, (t - starts[idx]) / Math.max(0.2, s.durasi || 1)));
    const sky = s.latar || palet.langit || "#1b2430";
    const ground = palet.tanah || "#2b3a2b";
    const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, sky); grad.addColorStop(1, ground);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, cv.width, cv.height);
    for (const d of decor) drawEmoji(d.emoji || "🌳", d.x || 400, d.y || 380, d.ukuran || 48);
    for (const ax of actors) {
      const cur = posMap(s, ax.id);
      const prev = posMap(scenes[Math.max(0, idx - 1)], ax.id);
      const from = prev || cur || [400, 320];
      const to = cur || from;
      drawActor(ax, lerp(from[0], to[0], p), lerp(from[1], to[1], p));
    }
    cap.textContent = s.teks || "";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  btnT.addEventListener("click", function () {
    if (t >= total) t = 0;
    playing = !playing; btnT.textContent = playing ? "Jeda" : "Putar";
  });
  document.getElementById("replay").addEventListener("click", function () {
    t = 0; playing = true; btnT.textContent = "Jeda";
  });
})();
</script>
</body>
</html>
"""


def render_animation_html(prompt: str, spec: dict) -> str:
    """Render spesifikasi animasi menjadi satu file HTML mandiri."""
    judul = (spec or {}).get("judul") or f"Animasi - {prompt}"
    spec_json = json.dumps(spec or {}, ensure_ascii=False).replace("</", "<\\/")
    return (
        ANIMATION_TEMPLATE.replace("__JUDUL__", html_escape(judul))
        .replace("__PROMPT__", html_escape(prompt))
        .replace("__SPEC__", spec_json)
    )


def html_escape(text: str) -> str:
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
