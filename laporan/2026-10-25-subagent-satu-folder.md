# Subagent satu folder: .opencode/agents/SubAgent

- Tanggal: 2026-10-25 18:00
- Status: selesai

## Permintaan
Semua definisi subagent hanya di `.opencode/agents/SubAgent`, masteragent membuat/membacanya dari folder itu, dan tidak ada folder agent/subagent lain.

## Yang dikerjakan
- Memulihkan 8 definisi divisi di `.opencode/agents/SubAgent/` (animator, background, colorist, compositor, designer, editor, sound, storyboard).
- Menambah `backend/app/subagents.py`: baca/tulis definisi subagent, provisioning divisi default, dan persona untuk pipeline.
- `POST /project` sekarang membuat definisi subagent yang belum ada untuk setiap sub-tugas, tanpa menimpa file yang sudah ada.
- Masteragent menyusun rencana dari daftar divisi di folder tersebut, menormalkan `agent_id`/`role`, dan memakai body subagent sebagai persona saat menulis deliverable/compositing.
- `GET /projects/{slug}/agents` tidak lagi memindai file output; hanya membaca definisi dari `.opencode/agents/SubAgent`.
- Scanner `.opencode/agents` hanya membaca berkas langsung di `SubAgent`; berkas root lain dan sub-folder diabaikan.
- Memindahkan `backend/agents/masteragent.py` ke `backend/app/masteragent.py` dan menghapus folder `backend/agents`, sehingga satu-satunya folder agent adalah `.opencode/agents`.
- Simulator event ikut memakai daftar divisi dari folder, bukan daftar hardcoded.

## File berubah
- `.opencode/agents/SubAgent/*.md` — dipulihkan dari git.
- `backend/app/subagents.py` — baru, satu sumber baca/tulis subagent.
- `backend/app/masteragent.py` — dipindah dari `backend/agents/`, membaca divisi/persona dari folder.
- `backend/app/main.py` — provisioning subagent, endpoint proyek, simulator dinamis.
- `backend/app/agent_scan.py` — hanya berkas langsung di `SubAgent`.
- `backend/app/workspace.py` — hapus scanner agent dari folder output.
- `studio-server/src/scanner.js` — aturan sumber yang sama.

## Verifikasi
- `backend/.venv/bin/python -m compileall -q app` — sukses.
- `frontend && npm run build` — sukses.
- `node --check studio-server/src/scanner.js` — sukses.
- Unit: `list_subagents()` = 8 divisi; `find_subagent()` mencocokkan id/name/role; provisioning default membuat 8 file dan tidak menimpa file yang ada.
- Integrasi `submit_project` (LLM di-mock): subagent dinamis dibuat, persona dari folder masuk ke deliverable, dan `animasi.html` terbentuk.
- Live: `GET /projects` 200, `POST /agents/scan` 200 (9 agen termasuk masteragent), `GET /projects/buatkan-animasi-meja/agents` hanya 5 divisi proyek dari folder SubAgent, frontend `http://localhost:5173` 200.

## Catatan / next step
- `studio-server/` dan `studio-web/` masih ada di disk tetapi tidak dipakai UI utama; belum dihapus.
