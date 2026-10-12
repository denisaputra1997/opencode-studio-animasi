---
description: Review kode yang baru ditulis — bug, edge case, dan konsistensi dengan pola repo.
agent: build
---

Review: $ARGUMENTS

1. Kalau `$ARGUMENTS` kosong, review perubahan yang belum commit (`git diff`) atau perubahan terakhir.
2. Baca kode dan file mirip di repo sebagai pembanding — criticize against the repo's own conventions, bukan versi generic.
3. Fokus, urut dari serius:
   - Bug / crash / logic salah
   - Edge case kosong, null, error, concurrency
   - Keamanan (injeksi, secret bocor, path traversal)
   - Duplikasi & konsistensi nama/struktur
   - Sisa debug, kode mati
4. Laporkan temuan per file: lokasi, apa salahnya, dampak, perbaikan singkat. Kalau tidak ada yang Serious, bilang begitu — jangan mengarang temuan.
5. Jangan edit file. Cuma review; tunggu user minta perbaikan.