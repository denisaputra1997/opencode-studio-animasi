# Dropdown direktori server untuk pemilih proyek

- Tanggal: 2026-10-25
- Status: selesai

## Permintaan
Mengganti input direktori + tombol "Pindai" di UI menjadi dropdown folder server. Memilih folder langsung memindai dan menjadikannya direktori aktif. Folder dianggap proyek jika memiliki `.opencode/agents`.

## Yang dikerjakan
- Menambah endpoint `GET /agents/scan/browse?path=...` di `backend/app/main.py`.
  - Mengembalikan `path`, `name`, `parent`, `is_project`, `home`, `repo`, dan `dirs` (`name`, `path`, `has_agents`).
  - Hanya menampilkan sub-folder langsung, melewati folder tersembunyi, dibatasi 500 folder.
  - Path tidak ada/bukan folder menghasilkan 404.
- `frontend/index.html`: input teks direktori diganti `<select id="project-path">` dan tombol muat ulang `#refresh-dirs`.
- `frontend/src/game.js`:
  - `renderDirectoryOptions()` menampilkan folder aktif, `.. (naik)`, `Home`, `Repo`, dan sub-folder.
  - Opsi folder aktif dan sub-folder proyek diberi label `— proyek`; folder biasa `— bukan proyek`.
  - `browseDirectories()` memuat isi folder; folder proyek langsung memicu `scanProjectDirectory()`, folder biasa hanya menampilkan status.
  - `initProjectSelector()` memakai path tersimpan di localStorage atau `/agents/scan/default` saat pertama dibuka.
  - `browseSerial` mencegah respons lama menimpa pilihan terbaru (race guard).
- `frontend/src/style.css`: gaya selector disesuaikan untuk elemen `select`.

## File berubah
- `backend/app/main.py` — endpoint browse direktori.
- `frontend/index.html` — markup dropdown direktori.
- `frontend/src/game.js` — logika browse, render opsi, auto-scan, race guard.
- `frontend/src/style.css` — gaya dropdown.

## Verifikasi
- `backend/.venv/bin/python -m compileall -q backend/app` — sukses.
- `npm run build` di `frontend/` — sukses.
- Endpoint via FastAPI `TestClient`:
  - Default repo `/home/ramnit/Documents/lalawidi/animasi`: `is_project=true`, 6 folder terlihat.
  - Parent `/home/ramnit/Documents/lalawidi`: `animasi` terbaca dengan `has_agents=true`.
  - Path tidak ada: 404 `Direktori tidak ditemukan`.
- Uji UI dengan Chrome headless + CDP (flag anti-throttling):
  - Awal: `animasi/ — proyek`, status `studio: animasi · 9 agen`, 9 opsi.
  - Pilih `backend`: `backend/ — bukan proyek`, status `folder: backend · bukan proyek (.opencode/agents tidak ada)`, 5 opsi.
  - Pilih kembali repo: `animasi/ — proyek`, status `studio: animasi · 9 agen`.
  - Pilih `backend` lalu langsung repo: hasil akhir tetap repo dan status studio.
- Server live berjalan: backend `:8000`, Vite `:5173`.

## Catatan
- Uji headless tanpa `--disable-background-timer-throttling` memberi jeda beberapa detik; setelah flag itu dipakai, respons UI normal. Ini artefak headless, bukan bug aplikasi.
- `studio-server/` dan `studio-web/` masih ada di disk tetapi belum dipakai UI utama.
