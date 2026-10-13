---
name: context7-docs
description: Use when you need up-to-date documentation for any library, framework, or SDK (react, next.js, tailwind, prisma, express, zod, etc.) instead of guessing from memory. Searches Context7 for real code examples.
---

# Context7 Docs

Ambil dokumentasi real-time dari Context7. Pakai ini **sebelum** menulis kode yang memakai API atau library pihak ketiga, supaya tidak bergantung pada ingatan.

## Cara pakai

Jalankan script di folder skill ini:

```bash
CONTEXT7_API_KEY=<key> bash scripts/fetch.sh "cara pakai useState" "react" 5
```

Argumen: `<pertanyaan>` `<nama library>` `[jumlah snippet, default 5]`.

`nama library` boleh berupa nama umum (`react`) atau ID persis (`/vercel/next.js`).

## Aturan

- Panggil **sekali** per pertanyaan. Kalau hasilnya kurang, perjelas query-nya — jangan panggil berulang.
- Ambil maksimal 5 snippet kecuali benar-benar butuh lebih.
- Kutip potongan kode seperlunya, jangan ulang seluruhnya di jawaban.
- Kalau hasilnya tidak relevan, coba lagi dengan istilah lain atau ID persis — maksimal 2 percobaan, lalu akui kalau tidak tahu.
- Kalau `CONTEXT7_API_KEY` belum di-set, remind user: `export CONTEXT7_API_KEY=...`