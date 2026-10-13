# Backend WebSocket + background task event

- Tanggal: 2026-10-12 21:19
- Status: selesai

## Permintaan
Buat kode server FastAPI dengan endpoint WebSocket `/ws` dan background task yang mengirim event JSON contoh setiap 3 detik ke client terhubung. Field event: `agent_id`, `role`, `state` (WORKING/IDLE), `task_description`.

## Yang dikerjakan
- Isi `backend/app/main.py` (path asli dari struktur "backend A"; user menulis `backend/main.py`).
- Connection manager sederhana: `connected: set[WebSocket]`, fungsi `broadcast()`.
- `event_producer()`: loop tak terbatas, kirim satu event acak via `broadcast`, lalu `asyncio.sleep(3)`.
- Lifecycle: task producer dibuat saat startup via `lifespan`, dibatalkan saat shutdown.
- Endpoint `/ws`: `accept`, daftarkan ke `connected`, tunggu pesan; hapus dari set saat `WebSocketDisconnect`.

## File berubah
- `backend/app/main.py` — implementasi server FastAPI + WebSocket

## Verifikasi
- `python3 -m py_compile backend/app/main.py` → compile OK.
- Uvicorn `app.main:app` di port 8123 + client `websockets` → terima 2 pesan, field lengkap, `state` valid (`WORKING`/`IDLE`), interval ~3 detik. Output `websocket OK`.

## Catatan / next step
- `broadcast` memakai `list(connected)` agar aman saat set berubah; koneksi gagal di-drop.
- Belum ada CORS/handler pesan masuk; belum di-commit.
