---
description: Bikin CRUD lengkap untuk sebuah entitas (model, validasi, API, UI, test).
agent: build
---

Buat CRUD untuk entitas: $ARGUMENTS

1. Cari dulu apakah sudah ada pola CRUD di proyek ini (cari file yang mirip) — ikuti pola itu, jangan buat gaya baru.
2. Yang di-generate: model/skema + validasi, endpoint create/read/update/delete, dan UI hanya kalau proyek punya UI. Tambahkan test kalau proyek sudah punya test.
3. Codegen dari satu definisi field (kepadatan/loop), jangan copy-paste per-field.
4. Jalankan lint + test yang relevan, laporkan hasilnya apa adanya.