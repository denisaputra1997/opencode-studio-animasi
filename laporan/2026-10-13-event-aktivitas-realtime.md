# Event aktivitas nyata: webhook + parser log → animasi real-time

- Tanggal: 2026-10-13 22:14
- Status: selesai

## Permintaan
Ubah logika event agar animasi frontend merespons aktivitas nyata / prompt user. Sediakan mekanisme (webhook/log parser sederhana) supaya setiap aktivitas coding agent / prompt memicu perubahan state animasi karakter di canvas secara real-time.

## Keputusan (konfirmasi user)
- Sumber event: **webhook + parser log** (keduanya), bukan simulator acak.

## Yang dikerjakan
- **`backend/app/events.py` (baru):**
  - Normalisasi event ke skema kanonik: `agent_id`, `role`, `state`, `task_description`, `progress` (0..1 atau null), `source`, `ts`.
  - `canonical_state()` memetakan kata kunci aktivitas → state: `WORKING`, `THINKING`, `DONE`, `BLOCKED`, `IDLE` (mis. `run/edit/build`→WORKING, `plan/read`→THINKING, `error/fail/gagal`→BLOCKED).
  - `parse_log_line()`: menerima baris log JSON atau teks `[agent_id] state task…`; baris tak dikenal diabaikan.
  - `ActivityStore`: simpan snapshot state terakhir per agent + `broadcast()`; event identik (state+task+progress sama) tidak diulang → hemat trafik.
  - `tail_log()`: memantau file log (poll) dan mem-publish baris baru; aman saat file belum ada / di-rotate.
- **`backend/app/main.py`:**
  - `POST /events` — webhook aktivitas (satu event atau `{"events":[...]}`).
  - `POST /events/log` — webhook baris log mentah, di-parse parser yang sama.
  - `GET /agents` — snapshot state semua agent.
  - `WS /ws` — saat connect, kirim snapshot dulu (canvas langsung mencerminkan kondisi nyata), lalu event live.
  - `POST /project` — prompt user kini: masteragent `THINKING` → sub-tugas `WORKING` → masteragent `DONE` (atau `BLOCKED` bila LLM gagal).
  - Simulator acak tetap ada tapi default mati (`SIMULATE_EVENTS=1`), kini lewat store + variasi state/progress.
  - Tail log file aktif bila env `ACTIVITY_LOG` di-set (`ACTIVITY_LOG_POLL` opsional, default 1s).
- **`frontend/src/game.js`:** state animasi per event:
  - `THINKING` (biru, goyangan pelan, monitor berkedip indeterminate) · `WORKING` (hijau, monitor terisi sesuai `progress` nyata; tanpa progress = indeterminate, tidak lagi auto-"Selesai") · `BLOCKED` (merah, karakter gemetar) · `DONE` (kilau + "Selesai" lalu idle) · `IDLE` (abu + cangkir).
  - Progress monitor mengikuti field `progress` dari event, bukan timer palsu.

## File berubah
- `backend/app/events.py` — normalisasi, store, parser & tailer log (baru)
- `backend/app/main.py` — endpoint webhook/log, snapshot WS, alur prompt
- `frontend/src/game.js` — state & progress animasi dari event nyata

## Verifikasi
- `py_compile backend/app/main.py backend/app/events.py` → OK.
- `node --check` (game.js sebagai .mjs) → OK. `npm run build` → sukses (`dist` dihapus setelahnya).
- Uvicorn port 8123 + client `websockets`:
  - `POST /events {animator, working, progress 0.4}` → WS terima `animator WORKING progress 0.4 source webhook`.
  - `POST /events/log "[colorist] thinking mewarnai keyframe"` → WS terima `colorist THINKING source log`.
  - `POST /events {}` (tanpa agent_id) → HTTP 400.
  - Client WS baru → terima snapshot 2 agent dengan state terakhir.
  - Tail file: menulis 3 baris (`[designer] working …`, JSON `sound done …`, 1 baris invalid) → 2 event terkirim, baris invalid diabaikan.
  - `POST /project` → urutan event: `masteragent THINKING` → 8 divisi `WORKING` → `masteragent DONE` (10 event).

## Cara pakai
- Backend: `cd backend && LLM_MODEL=<model-aktif> .venv/bin/python -m uvicorn app.main:app --port 8000`
- Kirim aktivitas dari coding agent/script:
  `curl -X POST localhost:8000/events -H 'Content-Type: application/json' -d '{"agent_id":"animator","state":"working","task_description":"render adegan","progress":0.4}'`
- Atau feed log: `curl -X POST localhost:8000/events/log -d '{"line":"[colorist] done mewarnai keyframe"}' -H 'Content-Type: application/json'`
- Atau pantau file log: set `ACTIVITY_LOG=/path/agent.log`.
- Buka http://localhost:5173/ — karakter berubah sesuai event masuk secara real-time.

## Catatan / next step
- Belum ada plugin opencode yang otomatis mem-POST event; sementara lewat `curl`/file log. Bisa ditambah bila diminta.
- Belum di-commit.
