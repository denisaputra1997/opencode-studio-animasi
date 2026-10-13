---
description: Tampilkan laporan kerja terakhir (atau yang cocok dengan argumen).
agent: masteragent
---

Tampilkan laporan kerja: $ARGUMENTS

1. Baca isi folder `laporan/`. Kalau kosong, bilang belum ada laporan — jangan mengarang.
2. Kalau `$ARGUMENTS` kosong, ambil file laporan terbaru (urut tanggal di nama file).
3. Kalau `$ARGUMENTS` diisi, cari file laporan yang namanya cocok dulu; kalau tidak ada, cari yang isinya menyebut kata kunci itu.
4. Tampilkan isi laporan itu apa adanya. Ringkas kalau lebih dari satu file — tunjukkan tanggal, judul, dan status tiap file.
5. Jangan ubah/tulis ulang file laporan.
