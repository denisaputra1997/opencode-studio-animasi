# Pemahaman ide aplikasi: OpenCode Studio - Animasi

- Tanggal: 2026-10-15 15:50
- Status: catatan (bukan pengerjaan fitur)

## Permintaan
Jelaskan aplikasi terakhir yang dibangun dan sejauh mana pemahaman atas maksud idenya, lalu rapikan jadi catatan di repo.

## Aplikasi yang dibangun
OpenCode Studio - Animasi (commit `506d78d`): kantor virtual isometrik tempat divisi-divisi AI (sub-agent) terlihat bekerja sambil benar-benar memproduksi animasi dari sebuah prompt.

Dua lapisan yang menyatu:

### 1. Lapisan produk (menghasilkan animasi)
- `POST /project` (`backend/app/main.py:217`) menerima prompt → masteragent memecah jadi sub-tugas (`make_plan`, `backend/agents/masteragent.py:52`).
- Tiap divisi menulis deliverable Markdown (`write_asset`) ke `output/<slug>/01-storyboard.md`, `02-background.md`, dst (`make_project_dir`, `backend/app/workspace.py:16`).
- `run_project` (`main.py:95`) meminta compositor menyusun spec JSON dari semua rancangan (`write_animation_spec`, `masteragent.py:219`), dirender jadi satu file mandiri `animasi.html` berisi canvas + mesin animasi (`render_animation_html`, `workspace.py:250`).

### 2. Lapisan observabilitas/visual (membuat kerja agent terlihat)
- Frontend Phaser menggambar studio isometrik: satu meja + karakter per divisi (`frontend/src/game.js:431` daftar divisi, kelas `Desk` di `game.js:58`).
- Tiap agent punya state `WORKING / THINKING / DONE / BLOCKED / IDLE`, balon tugas, progress bar di monitor, dan animasi.
- State dikirim real-time lewat WebSocket `/ws` (`main.py:313`, `ActivityStore` di `backend/app/events.py:87`). Snapshot dikirim saat client connect agar canvas langsung mencerminkan kondisi nyata.
- Plugin opencode (`.opencode/plugins/animasi-studio.ts`) menempel ke event opencode asli — `chat.message`, `tool.execute.before/after`, `session.status`, `todo.updated`, `file.edited` — lalu meneruskannya ke webhook `/events`. Jadi canvas mencerminkan aktivitas agent opencode sungguhan, bukan simulasi.

## Maksud/ide inti
Intinya bukan sekadar "generator animasi dari prompt", melainkan **membuat kerja orkestrasi multi-agent jadi kasat mata** — mengubah pipeline agent yang abstrak menjadi "kantor yang hidup" yang bisa ditonton.

- **Masteragent = satu-satunya pintu.** User hanya bicara ke masteragent; semua delegasi lewat dia (`.opencode/agents/masteragent.md:12`). Terminologi "manager" selalu = masteragent (`AGENTS.md`). Di canvas, masteragent punya meja sendiri di atas (`game.js:465`, `MASTER_Y`), divisi lain mengelilinginya.
- **Dua realitas, satu peta.** Alur "sungguhan" menghasilkan file; alur "panggung" menampilkan aktivitas. Keduanya bertemu di state per-agent.
- **Divisi tetap ala studio animasi** (storyboard → designer → background → animator → colorist → compositor → sound → editor), masing-masing punya skill (`SKILL.md`), dan divisi yang sama juga divisualisasikan.
- **Alur produksi berlapis:** prompt → rencana → deliverable per divisi → spec JSON → satu HTML animasi yang bisa diputar. Compositor jadi titik penggabungan.
- **Stop bagian dari ide.** Tombol Stop (`POST /stop`, `main.py:274`; `game.js:623`) membatalkan tugas berjalan dan me-reset semua agent ke IDLE — konsisten dengan fokus kontrol & visibilitas.

## Pertanyaan terbuka (perlu konfirmasi user)
- **Aktor utama siapa?** User umum (bikin animasi lewat UI) atau developer/penonton yang ingin mengintip kerja opencode? Repo menekankan yang kedua (plugin + event), UI menekankan yang pertama (form prompt).
- **Dua mesin orkestrasi.** Ada planner LLM di Python (`main.py`) dan sistem subagent opencode (`.opencode/agents`). Belum jelas mana yang kanonik — apakah Python engine hanya demo saat plugin tidak jalan?
- **Kualitas animasi.** Mesin render memakai emoji + posisi x/y per adegan (`workspace.py:148`). Ini sengaja "cukup jalan" sebagai bukti alur, atau memang arah produk (animasi bergaya emoji)?
- **Integrasi laporan.** Kewajiban laporan per task (`masteragent.md`) belum tampak terhubung otomatis ke backend/UI.

## Catatan / next step
- Menunggu jawaban atas pertanyaan terbuka di atas sebelum lanjut mengarahkan pengembangan.
