# Bereskan LLM_MODEL: default stabil + fallback

- Tanggal: 2026-10-12 21:46
- Status: selesai

## Permintaan
Bereskan masalah `LLM_MODEL` (default `combo:openRoute` intermiten 404) agar backend jalan tanpa set env.

## Yang dikerjakan
- `backend/agents/masteragent.py`:
  - Ganti default dari `combo:openRoute` menjadi daftar model `DEFAULT_MODELS` (default `LLM_MODEL` = join koma): `claude-sonnet-5.5`, `gpt-6-luna`, `qwen/qwen3.8-max-prime`, `upstage/solar-mini4`.
  - `make_plan()` kini mencoba tiap model berurutan; kalau gagal (404/429/402/dll) lanjut ke model berikut. Kalau semua gagal, `RuntimeError` berisi ringkasan error.
  - `LLM_MODEL` tetap bisa di-override via env, dan sekarang menerima daftar dipisah koma.

## File berubah
- `backend/agents/masteragent.py` — default model + fallback loop

## Verifikasi
- Tes model gateway (json_schema, max_tokens=200): `claude-sonnet-5.5`, `gpt-6-luna`, `glm-5.3-prime`, `qwen3.8-max-prime`, `aion-3.5-mini`, `solar-mini4` → 200; `apodex...:free` → 400; `ling-3.1-flash` → 429.
- `make_plan` **tanpa env** → sukses, 5 sub-tugas.
- Fallback: `LLM_MODEL="model-rusak-xyz,provider:OpenRouter:openai/gpt-6-luna"` → sukses (3 sub-tugas), model pertama gagal lalu pindah otomatis.

## Catatan / next step
- Jalankan backend tanpa env: `cd backend && .venv/bin/python -m uvicorn app.main:app --port 8000`.
- Masih terbuka: event simulasi 3 detik bercampur dengan event asli; belum di-commit.
