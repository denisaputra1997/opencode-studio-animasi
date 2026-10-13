# Aturan laporan/log kerja per task
- Tanggal: 2026-10-12 15:18
- Status: selesai

## Permintaan
Tambahkan aturan agar setiap kerjaan dibuatkan report/log agar user mudah membaca laporan.

## Yang dikerjakan
- Pilih opsi penyimpanan: satu file per task di `laporan/<tanggal>-<slug>.md`.
- Tambah section "Laporan kerja (wajib setiap task)" di `masteragent.md`.
- Update section review kerja sebelumnya agar membaca `laporan/`.
- Buat command `/lapor` untuk menampilkan laporan terakhir.
- Buat folder `laporan/` + buat laporan ini sebagai contoh.

## File berubah
- `.opencode/agents/masteragent.md` — tambah aturan wajib laporan + arahkan ke `laporan/`
- `.opencode/command/lapor.md` — command baru untuk baca laporan
- `laporan/.gitkeep` — agar folder `laporan/` ikut terlacak git
- `laporan/2026-10-12-aturan-laporan-kerja.md` — laporan ini

## Verifikasi
- `ls laporan` → folder ada, `.gitkeep` ada.
- Baca ulang `masteragent.md` baris 19-55 → section laporan benar.
- `git status` → file baru terdeteksi (belum di-commit).

## Catatan / next step
- Restart opencode agar command `/lapor` dan aturan baru terbaca.
- Belum di-commit; tunggu perintah user.
