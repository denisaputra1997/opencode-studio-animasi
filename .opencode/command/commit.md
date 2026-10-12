---
description: Commit perubahan saat ini dengan pesan yang sesuai gaya repo.
agent: build
---

Commit perubahan: $ARGUMENTS

1. `git status`, `git diff`, `git log --oneline -10` — pahami dulu apa yang berubah dan gaya pesan commit repo ini.
2. Stage HANYA file yang relevan. Jangan pernah stage rahasia (`.env`, `*.key`, token, `apikey.txt`). Kalau lihat yang mencurigakan, jangan stage dan beri tahu user.
3. Pesan: ringkas, satu baris, gaya sama seperti 10 commit terakhir. Kalau `$ARGUMENTS` isi instruksi pesan, ikutkan.
4. Commit. Kalau hook gagal, perbaiki lalu commit ulang dengan commit baru — jangan amend.
5. Jangan push kecuali `$ARGUMENTS` menyebut push.
6. Laporkan: hash commit + file yang masuk.