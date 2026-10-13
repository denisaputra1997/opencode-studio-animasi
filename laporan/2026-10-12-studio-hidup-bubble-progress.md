# Studio hidup: karakter, gelembung task, progress

- Tanggal: 2026-10-12 22:13
- Status: selesai

## Permintaan
Buat animasi 2D simple tapi menarik selayaknya di dalam studio kerja: karakter hidup + gelembung task_description + progress per agent (opsi 2, hasil konfirmasi user).

## Yang dikerjakan
- **Studio hidup** (`frontend/src/game.js`):
  - Dekorasi: lantai isometrik bergrid, papan tulis (whiteboard), jam dinding, dua tanaman pot.
  - Karakter masuk (walk-in) dari samping saat meja dibuat, warna baju beda per divisi.
  - Karakter idle sesekali jalan sebentar lalu kembali (`stroll`, timer acak tiap 6 detik).
- **Gelembung task + progress**:
  - Gelembung (`bubble`) muncul saat ada `task_description`, ukuran mengikuti panjang teks + ekor.
  - Monitor jadi progress bar: layar terisi kiri→kanan sesuai progress (naik saat WORKING).
  - Saat penuh → status "Selesai" + efek kilau (sparkle), lalu balik IDLE (cangkir kopi muncul lagi).
- **Backend** (`backend/app/main.py`): `event_producer` (event acak tiap 3 detik) kini **opsional** via env `SIMULATE_EVENTS` (default `0`/mati) agar studio mencerminkan kerja nyata, bukan acak.

## File berubah
- `frontend/src/game.js` — dekorasi studio, walk-in, stroll, bubble, progress monitor, efek selesai
- `backend/app/main.py` — `import os` + flag `SIMULATE_EVENTS`

## Verifikasi
- `py_compile` backend OK; `npm run build` sukses.
- Backend di-restart (PID 10218). Tes WS: **tidak ada event ambient** (simulator OFF). `POST /project` → event `masteragent` + 8 divisi (storyboard, designer, background, animator, colorist, compositor, sound, editor) `WORKING` dengan task.
- Frontend `http://localhost:5173/` → 200; backend `/docs` → 200.

## Cara pakai
- Buka http://localhost:5173/, tulis prompt → Kirim. Karakter divisi masuk, gelembung task muncul, progress monitor terisi, lalu "Selesai".
- Mau nyalakan event acak lagi: jalankan backend dengan `SIMULATE_EVENTS=1`.

## Catatan / next step
- Belum di-commit.
