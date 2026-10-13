# Plugin opencode: aktivitas agen → event animasi otomatis

- Tanggal: 2026-10-13 22:24
- Status: selesai

## Permintaan
Tambahkan mekanisme otomatis (plugin opencode) agar aktivitas coding agent / prompt user langsung mem-POST event ke backend, menggantikan `curl` manual.

## Yang dikerjakan
- **`.opencode/plugins/animasi-studio.ts` (baru)** — plugin opencode (auto-loaded dari `.opencode/plugins/`). Hook → `POST /events`:
  - `chat.message` → masteragent `WORKING` "Prompt: …" (prompt user).
  - `tool.execute.before` → tool `task` dipetakan ke divisi dari `subagent_type`/`description` → divisi `THINKING`; tool lain → masteragent `WORKING` (label Indonesia: bash→"menjalankan perintah", edit→"menulis kode", dst).
  - `tool.execute.after` → divisi `DONE`; tool lain → masteragent `WORKING` "Selesai …".
  - `event` bus: `session.status` (busy/retry/idle), `session.idle` → `IDLE`, `session.error` → `BLOCKED`, `permission.updated`/`asked` → `BLOCKED`, `command.executed`, `file.edited`, dan `todo.updated` → progress nyata (`completed/total`) + isi todo in-progress.
  - Deteksi divisi dari 8 divisi studio (storyboard…editor) + `role` yang mudah dibaca.
  - Throttle per agent (env `ANIMASI_WEBHOOK_THROTTLE`, default 200ms) & timeout 1.5s; gagal POST tidak mengganggu sesi opencode.
  - Konfigurasi env: `ANIMASI_WEBHOOK` (default `http://localhost:8000/events`, set `off`/`0` untuk matikan).
- Pakai tipe resmi opencode: dicek dari `@opencode-ai/plugin` (`Hooks`) + `@opencode-ai/sdk` (`Event` union) yang terpasang di `~/.config/opencode/node_modules`.

## File berubah
- `.opencode/plugins/animasi-studio.ts` — plugin (baru)

## Verifikasi
- `node --experimental-strip-types --check .opencode/plugins/animasi-studio.ts` → OK.
- Uji runtime (Node import plugin langsung, backend uvicorn :8123, client WS):
  - `chat.message` → `masteragent WORKING | Prompt: Bikin animasi penalti`
  - `task` before/after → `animator THINKING` lalu `animator DONE` (deskripsi sama)
  - `tool.execute.before bash` → `masteragent WORKING | menjalankan perintah: npm run build`
  - `todo.updated` (1/2) → `masteragent WORKING progress 0.5 | render adegan`
  - `session.error` → `masteragent BLOCKED | Error: ApiError`
  - `session.idle` → `masteragent IDLE | Menunggu`
  - Total 7/7 event terkirim ke WS sesuai harapan.

## Cara pakai
- Jalankan backend di `localhost:8000` (lihat laporan webhook), lalu **restart opencode** agar plugin terbaca.
- Setelahnya aktivitas agen (prompt, tool, delegasi `task`, todo, error) otomatis mengubah state animasi di canvas.
- Ganti endpoint bila perlu: `ANIMASI_WEBHOOK=http://host:port/events`.

## Catatan / next step
- Divisi dideteksi dari nama `subagent_type`/deskripsi; `SubAgent/<divisi>` cocok langsung.
- Belum di-commit.
