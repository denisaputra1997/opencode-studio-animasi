# Perbaikan demo end-to-end (meja dinamis, form prompt, CORS)

- Tanggal: 2026-10-12 21:44
- Status: selesai

## Permintaan
Perbaiki 3 kendala yang disarankan: (1) meja dinamis, (2) UI kirim prompt, (3) CORS.

## Yang dikerjakan
- **Meja dinamis** (`frontend/src/game.js`): buang daftar meja statis. Scene kini punya `addDesk(id)` yang membuat meja saat `agent_id` baru datang (mis. `agent-04+`), lalu `layout()` menata ulang (masteragent di atas, sub-agent mengisi grid, tiap baris di-center). Teks diberi `depth` agar selalu terlihat.
- **UI kirim prompt** (`frontend/index.html` + `game.js`): form `#prompt-form` + input + tombol, handler submit `POST` ke `http://localhost:8000/project` via `fetch`, tampilkan status/jumlah sub-tugas di `#status`.
- **CORS** (`backend/app/main.py`): tambah `CORSMiddleware` (`allow_origins/methods/headers = ["*"]`) agar browser boleh `POST /project`.

## File berubah
- `frontend/src/game.js` — meja dinamis + handler form prompt
- `frontend/index.html` — markup & style form prompt
- `backend/app/main.py` — CORSMiddleware

## Verifikasi
- `py_compile` backend → OK. `npm run build` → sukses.
- Preflight `OPTIONS /project` dari Origin `http://localhost:5173` → `HTTP 200`, `access-control-allow-origin: *`, headers methods/headers benar.
- `POST /project` + client WS → 7 subtasks, ACAO `*`, event sampai `agent-05` diterima. Output `dynamic agents (>03) diterima OK`.
- `frontend/dist` dihapus (artefak build).

## Catatan / next step
- Masih terbuka (belum diminta): event simulasi tiap 3 detik masih bercampur dengan event asli; `LLM_MODEL` wajib di-set (default `combo:openRoute` intermiten); `backend/agents` harus dijalankan dari folder `backend/`; belum di-commit.
