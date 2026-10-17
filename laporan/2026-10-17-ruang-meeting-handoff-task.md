# Ruang meeting untuk serah-terima tugas masteragent → sub-agent

- Tanggal: 2026-10-17
- Status: selesai (belum di-commit)

## Permintaan
Tambahkan ruangan meeting di tampilan kantor. Saat masteragent memberi tugas ke
sub-agent, keduanya berkumpul di ruang meeting (sub-agent yang bersangkutan dengan
tugas itu). Setelah serah-terima selesai, keduanya kembali ke meja masing-masing.

## Yang dikerjakan
- Backend memancarkan pesan khusus `{"type": "meeting", "phase": "start"|"end",
  "participants": ["masteragent", <divisi>], "task": ...}` lewat WebSocket.
- Alur `/project` diubah jadi berurutan: tiap sub-tugas didahului `handoff_meeting`
  (masteragent + sub-agent berkumpul), baru sub-agent mengerjakan deliverable.
- Webhook `/events` (jalur plugin opencode) ikut memicu meeting saat plugin mengirim
  event dengan field `meeting: "start"` pada delegasi `task`.
- `MEETING` jadi state baru agent (warna ungu, label "Meeting").
- Frontend menggambar "RUANG MEETING" (karpet + meja bundar + 2 kursi + label) di
  bagian bawah panggung.
- Karakter bisa "berjalan" meninggalkan mejanya: furnitur meja disembunyikan selama
  perjalanan, karakter dianimasikan ke kursi ruang meeting, menahan sebentar
  (briefing), lalu kembali ke meja. Depth mengikuti posisi y agar urutan isometrik benar.
- Antrean meeting di frontend: meeting dijalankan satu-per-satu, jadi masteragent
  tidak pernah berada di dua meeting sekaligus.

## File berubah
- `backend/app/events.py` — state `MEETING` + alias (`meeting`/`handoff`/`briefing`).
- `backend/app/main.py` — `meeting_message`, `handoff_meeting`, `run_pipeline`,
  `run_project` tanpa tasks, deteksi `meeting` di `/events`,
  env `STUDIO_MEETING_SECONDS` (default 3.0).
- `frontend/src/game.js` — state/`setMeeting`, `travel`/`goHome`/`setFurnitureVisible`,
  `drawMeetingRoom`, antrean `startMeeting`/`pumpMeetings`, penanganan pesan meeting
  di WebSocket, layout disesuaikan (MASTER_Y 180, TOP_Y 280, canvas 620).
- `.opencode/plugins/animasi-studio.ts` — kirim `meeting: "start"`/`"end"` saat delegasi `task`.

## Verifikasi
- `python3 -m py_compile backend/app/main.py backend/app/events.py` → OK.
- `node --check frontend/src/game.js` → OK.
- Uji webhook: POST `/events` dengan `meeting:"start"` → WS menerima
  `{"type":"meeting","participants":["masteragent","storyboard"],...}`.
- Uji `handoff_meeting` langsung → urutan: meeting start → masteragent MEETING →
  sub-agent MEETING → meeting end → masteragent IDLE.
- `./run.sh` → backend `:8000` dan frontend `:5173` keduanya HTTP 200.

## Penyesuaian: geser ruang meeting ke kanan (revisi)
- Ruang meeting dipindah dari bawah-tengah (400, 545) ke kanan (690, 400).
- Grid divisi digeser kiri (`DIV_SHIFT = -95`) dan `COL_GAP` 160→150 supaya label
  kolom terakhir tidak menjangkau ruang meeting (kolom terakhir: label kanan ≈ 585,
  tepi kiri ruang = 590).
- Ukuran rug dikecilkan (setengah-lebar 100, setengah-tinggi 54); kursi di ±58.
- Dua tanaman dipindah ke (28, 330) dan (772, 330) agar tidak bertumbukan.
- Verifikasi otomatis: skrip di halaman menghitung bounds tiap `nameText`/`statusText`
  vs kotak ruang `x[590..790] y[346..454]` → semua `hit: false` (label terdekat
  "Sound Designer" tepi kanan 585, berjarak 5 px).

## Catatan / next step
- Durasi meeting disinkronkan kasar: backend `STUDIO_MEETING_SECONDS=3.0` vs
  frontend travel(900)+hold(1200)+travel(900)=3000 ms.
- Belum diuji end-to-end lewat `/project` karena server LLM `localhost:8080` belum jalan.
- Belum di-commit; menunggu perintah user.
