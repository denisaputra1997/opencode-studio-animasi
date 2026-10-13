# Subagent divisi studio + skill per divisi

- Tanggal: 2026-10-12 22:07
- Status: selesai

## Permintaan
Buat agent per divisi sebagai subagent opencode di `.opencode/agents/SubAgent/`, masing-masing dengan skill dan rules sendiri.

## Klarifikasi user
- Yang dimaksud: **subagent opencode** (`.opencode/`), bukan agent runtime backend.
- Komunikasi: user hanya berhubungan dengan **MasterAgent**; subagent tak berhubungan langsung dengan user. Jadi tidak ada perubahan alur komunikasi.

## Yang dikerjakan
- Buat 8 subagent di `.opencode/agents/SubAgent/` (frontmatter `mode: subagent` + body = rules):
  `storyboard`, `designer`, `background`, `animator`, `colorist`, `compositor`, `sound`, `editor`.
  Tiap rules memuat: tanggung jawab, aturan (kerjakan hanya task dari MasterAgent, ikuti `AGENTS.md`, Bahasa Indonesia, tak berkomunikasi langsung dengan user), dan output.
- Buat 8 skill di `.opencode/skills/<divisi>/SKILL.md` (alur kerja + aturan per divisi).
- Update `.opencode/agents/masteragent.md`: tambah section "Subagent divisi studio" berisi daftar divisi + skill + cara panggil (`SubAgent/<nama>`), dan arahan untuk mengutamakan divisi tetap sebelum membuat subagent baru.

## File berubah
- `.opencode/agents/SubAgent/{storyboard,designer,background,animator,colorist,compositor,sound,editor}.md` — rules per divisi
- `.opencode/skills/{storyboard,designer,background,animator,colorist,compositor,sound,editor}/SKILL.md` — skill per divisi
- `.opencode/agents/masteragent.md` — daftar subagent divisi

## Verifikasi
- `ls .opencode/agents/SubAgent` → 8 file `.md`.
- `ls .opencode/skills` → 8 folder divisi + `context7-docs`.
- `.opencode/.gitignore` tidak mengabaikan `agents/`/`skills/` → ikut terlacak.

## Catatan / next step
- **Restart opencode** agar subagent divisi terbaca (opencode memindai `.opencode/agents/` saat start).
- Divisi disamakan dengan yang dipakai app (backend simulator & prompt LLM).
- Belum di-commit.
