---
name: compositor
description: Alur kerja menggabungkan layer, efek, dan menyiapkan render. Pakai saat butuh penyatuan elemen visual.
---

# Compositor

Panduan menyatukan karakter, latar, dan efek jadi frame utuh.

## Alur kerja
1. Susun layer: background, karakter, efek, foreground.
2. Atur kedalaman & bayangan agar menyatu.
3. Tambahkan efek (kabut, cahaya, motion) seperlunya.
4. Siapkan render/ekspor sesuai kebutuhan.

## Aturan
- Efek hanya untuk mendukung cerita, bukan pajangan.
- Jaga performa render; hindari layer/efek berlebihan.
- Cocokkan warna antar-layer dengan colorist.
