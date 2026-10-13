# Visual karakter studio + penamaan divisi animasi

- Tanggal: 2026-10-12 21:57
- Status: selesai

## Permintaan
(1) Tampilan karakter dibuat lebih menarik (project animasi). (2) Penamaan agent menyesuaikan divisi animasi sesuai tugasnya (mis. tugas desain → "designer").

## Yang dikerjakan
- **Penamaan divisi** :
  - `backend/agents/masteragent.py`: system prompt diubah → LLM mengisi `agent_id` = slug divisi (storyboard, designer, animator, colorist, compositor, background, editor, sound) dan `role` = nama divisi yang mudah dibaca sesuai tugas.
  - `backend/app/main.py`: simulator `AGENTS`/`TASKS` diubah ke divisi & tugas animasi (storyboard, designer, animator, colorist, compositor).
  - `frontend/src/game.js`: meja diberi label dari `role` (divisi), bukan `agent_id`.
- **Visual karakter** (`frontend/src/game.js`):
  - Kelas `Desk`: karakter (badan + kepala + rambut + mata) dengan warna baju beda per divisi (hash `role`), meja kubus isometrik (top + 2 sisi), monitor dengan layar yang berubah warna, bayangan, label nama, dan status.
  - Animasi: karakter naik-turun (idle bob, makin cepat saat WORKING), layar monitor berkedip (glow) saat WORKING, dan pulse skala tiap update status.
  - Judul scene "OpenCode Studio - Animasi".

## File berubah
- `backend/agents/masteragent.py` — prompt divisi animasi
- `backend/app/main.py` — simulator divisi animasi
- `frontend/src/game.js` — kelas Desk + karakter & animasi + label role

## Verifikasi
- `py_compile` backend OK; `npm run build` sukses.
- Backend di-restart (PID 9304). `POST /project` prompt "kucing mengejar kupu-kupu di taman" menghasilkan 8 sub-tugas dengan role: Storyboard Artist, Character Designer, Background Artist, Animator, Colorist, Compositor, Sound Designer, Editor.
- Frontend `http://localhost:5173/` → 200; backend `/docs` → 200.

## Catatan / next step
- Vite dev server jalan (HMR) — refresh browser untuk lihat tampilan baru.
- Masih terbuka: event simulasi tiap 3 detik bercampur dengan event asli; belum di-commit.
