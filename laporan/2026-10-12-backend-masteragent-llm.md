# MasterAgent: LLM structured output + broadcast WebSocket

- Tanggal: 2026-10-12 21:34
- Status: selesai

## Permintaan
Buat `backend/agents/manager.py` berisi logika LLM dengan structured output: terima prompt proyek, pecah jadi sub-tugas, kirim hasil via event WebSocket ke frontend. Hubungkan ke `backend/main.py`.

## Keputusan (hasil konfirmasi user)
- Nama file/class: **masteragent** (sesuai konvensi `AGENTS.md`), bukan `manager`.
- LLM dipanggil pakai **OpenAI SDK** (`openai`), endpoint OpenAI-compatible lokal.

## Yang dikerjakan
- `backend/agents/masteragent.py` (baru):
  - Client `AsyncOpenAI` dari env: `LLM_BASE_URL` (default `http://localhost:8080/v1`), `LLM_API_KEY` (default `aigate-local`), `LLM_MODEL` (default `combo:openRoute`), `LLM_MAX_TOKENS` (default 1000).
  - Structured output via Pydantic `Plan`/`SubTask` + `client.beta.chat.completions.parse`.
  - `make_plan(prompt) -> Plan` dan `plan_to_events(plan) -> list[dict]` (schema event sama dengan frontend/backend: `agent_id`, `role`, `state`, `task_description`).
- `backend/app/main.py`: tambah `POST /project` (`ProjectRequest.prompt`) → broadcast event masteragent `WORKING`, panggil `make_plan`, broadcast tiap sub-tugas sebagai event; error LLM → HTTP 502.
- `backend/requirements.txt`: tambah `openai`.
- `.gitignore`: tambah `.venv/`, `dist/`.
- `backend/agents/__init__.py`: package marker.

## Catatan env > 1 file
- `LLM_MODEL` default `combo:openRoute` (samakan `opencode.json`) — tapi upstream saat ini membalas 404 (model free tidak tersedia). Saat verifikasi dipakai `provider:OpenRouter:anthropic/claude-sonnet-5.5`.
- Parameter `max_tokens` wajib dibatasi; tanpa itu gateway minta 65536 token → error 402 (kredit).

## Verifikasi
- `pip install -r requirements.txt` di `backend/.venv` → deps OK (openai 3.29.0).
- `make_plan("Bikin landing page portofolio sederhana")` → 6 sub-tugas terstruktur (agent-01..06). Output benar.
- Uvicorn + client `websockets`: `POST /project` → 6 subtasks; WS broadcast menerima event `masteragent WORKING` + `agent-0x WORKING`. Output `endpoint + ws broadcast OK`.

## Next step
- Backend: `LLM_MODEL=<model-aktif> .venv/bin/python -m uvicorn app.main:app --port 8000`.
- Frontend belum kirim prompt; sudah ada desk `agent-01..03` + `masteragent` (agent-04+ dari LLM belum punya meja).
- Belum di-commit.
