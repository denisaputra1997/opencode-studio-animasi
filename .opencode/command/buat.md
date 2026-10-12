---
description: Buat file/komponen baru dari template standar proyek ini.
agent: build
---

Buat: $ARGUMENTS

Langkah:
1. Deteksi stack & konvensi proyek dulu (baca `AGENTS.md`/README, `package.json`/`pyproject.toml`, dan 1-2 file yang mirip). Ikuti gaya yang sudah ada, jangan mengarang.
2. Kalau belum jelas stack-nya, tanya user sebelum menulis.
3. Tulis kode seminimal mungkin: satu file > banyak file, tanpa abstraksi/folder yang tidak diminta.
4. Kalau proyek punya linter/formatter, jalankan di file itu dan perbaiki hasilnya.
5. Laporkan: file yang dibuat + hasil verifikasi. Jangan commit kecuali diminta.