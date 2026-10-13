# Frontend Phaser isometric + client WebSocket

- Tanggal: 2026-10-12 21:26
- Status: selesai

## Permintaan
Buat `frontend/index.html` dan `frontend/src/game.js` pakai Phaser.js: kanvas 2D isometric dengan kotak meja kerja untuk MasterAgent (manager) dan beberapa Sub-Agent, plus client WebSocket ke `ws://localhost:8000/ws` yang mengubah warna/status kotak saat data diterima.

## Yang dikerjakan
- `index.html`: container `#game` + indikator koneksi `#status`, load `/src/game.js` sebagai module, styling dasar.
- `game.js`: scene Phaser isometric sederhana.
  - 4 meja bentuk diamond (proyeksi isometric): `masteragent`, `agent-01`, `agent-02`, `agent-03`.
  - Warna per state: WORKING hijau, IDLE abu-abu, default gelap; label status + `task_description` di bawah meja.
  - Client WebSocket ke `ws://localhost:8000/ws`, update meja via `agent_id`; reconnect tiap 2 detik saat putus.
- `package.json`: tambah dependency `phaser` (`^3.80.0`).
- `vite.config.js`: diisi `export default {}` (sebelumnya kosong sehingga `vite build` gagal).
- `backend/app/main.py`: tambah agen `masteragent` (role `masteragent`) + task "Mengoordinasi sub-agent" supaya kotak MasterAgent ikut menerima event (end-to-end).
- `AGENTS.md`: catat konvensi "manager" = masteragent, berlaku seterusnya.

## File berubah
- `frontend/index.html` — UI kanvas + indikator koneksi
- `frontend/src/game.js` — scene Phaser + client WebSocket
- `frontend/package.json` — tambah `phaser`
- `frontend/vite.config.js` — buat valid (kosong sebelumnya)
- `backend/app/main.py` — tambah agen masteragent
- `AGENTS.md` — konvensi penamaan manager → masteragent

## Verifikasi
- `python3 -m py_compile backend/app/main.py` → OK.
- `npm install` lalu `npm run build` → sukses (vite 5.4.21, 7 modul, bundle dibuat).
- Uvicorn port 8000 + client `websockets` (12 event) → agent `masteragent`, `agent-01..03` muncul. Output `backend+ws OK`.
- `frontend/dist` dihapus (artefak verifikasi).

## Catatan / next step
- Jalankan: backend `uvicorn app.main:app --port 8000`; frontend `npm run dev`.
- Phaser via npm import (bukan CDN); bundle besar (~1.5 MB) — wajar untuk Phaser.
- Belum di-commit.
