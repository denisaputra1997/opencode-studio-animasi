---
description: Cari kode yang berulang/duplikat di proyek dan tarik jadi komponen reusable.
agent: build
---

Cari duplikasi kode: $ARGUMENTS

1. Scan proyek (grep untuk blok yang mirip: boilerplate, validasi, fetch, styling, handler).
2. Laporkan daftar dupli: file mana, berapa kali, seberapa mirip.
3. Untuk yang jelas duplikat, usulkan tarikan jadi satu helper/komponen — jangan langsung refactor semua, prioritaskan 3 yang paling layak.
4. Kalau user setuju, baru eksekusi refactor dan jalankan test.
5. Kalau `$ARGUMENTS` kosong, fokus ke file yang paling sering diubah / paling besar.