import json
import os

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080/v1")
API_KEY = os.getenv("LLM_API_KEY", "aigate-local")
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1000"))
ANIM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS_ANIM", "2000"))

DEFAULT_MODELS = [
    "provider:OpenRouter:anthropic/claude-sonnet-5.5",
    "provider:OpenRouter:openai/gpt-6-luna",
    "provider:OpenRouter:qwen/qwen3.8-max-prime",
    "provider:OpenRouter:upstage/solar-mini4",
]
MODELS = [m.strip() for m in os.getenv("LLM_MODEL", ",".join(DEFAULT_MODELS)).split(",") if m.strip()]

SYSTEM_PROMPT = (
    "Kamu adalah masteragent di sebuah studio animasi. Terima prompt proyek dari "
    "pengguna, lalu pecah menjadi beberapa sub-tugas untuk sub-agent. Untuk setiap "
    "sub-tugas tentukan: agent_id = nama divisi huruf kecil dengan tanda hubung "
    "(mis. storyboard, designer, animator, colorist, compositor, background, editor, "
    "sound), role = nama divisi yang mudah dibaca sesuai jenis tugasnya "
    "(mis. Storyboard Artist, Character Designer, Animator), dan task_description "
    "singkat dalam Bahasa Indonesia. Pilih divisi yang paling cocok dengan tugas itu."
)

client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)


class SubTask(BaseModel):
    agent_id: str = Field(description="ID sub-agent, mis. agent-01")
    role: str = Field(description="Peran sub-agent, mis. planner/coder/reviewer")
    task_description: str = Field(description="Deskripsi singkat sub-tugas")


class Plan(BaseModel):
    subtasks: list[SubTask] = Field(description="Daftar sub-tugas hasil pemecahan")


ASSET_PROMPT = (
    "Kamu adalah {role} di sebuah studio animasi. Kerjakan sub-tugas berikut untuk "
    "proyek: \"{prompt}\".\n\nSub-tugas: {task}\n\n"
    "Tulis deliverable dalam Bahasa Indonesia dengan format Markdown yang rapi dan "
    "langsung dapat dipakai (heading, poin-poin, detail teknis singkat). Jangan "
    "mengulang instruksi ini; langsung tulis isi deliverable-nya saja."
)


async def make_plan(prompt: str) -> Plan:
    errors = []
    for model in MODELS:
        try:
            completion = await client.beta.chat.completions.parse(
                model=model,
                max_tokens=MAX_TOKENS,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                response_format=Plan,
            )
            return completion.choices[0].message.parsed
        except Exception as exc:
            errors.append(f"{model}: {exc}")
    raise RuntimeError("Semua model gagal -> " + " | ".join(errors))


async def write_asset(role: str, task: str, prompt: str) -> str:
    """Buat isi file deliverable untuk satu divisi lewat LLM."""
    errors = []
    messages = [
        {"role": "system", "content": ASSET_PROMPT.format(role=role, prompt=prompt, task=task)},
        {"role": "user", "content": "Tulis deliverable-nya sekarang."},
    ]
    for model in MODELS:
        try:
            completion = await client.chat.completions.create(
                model=model,
                max_tokens=MAX_TOKENS,
                messages=messages,
            )
            content = (completion.choices[0].message.content or "").strip()
            if content:
                return content
            errors.append(f"{model}: jawaban kosong")
        except Exception as exc:
            errors.append(f"{model}: {exc}")
    raise RuntimeError("Semua model gagal -> " + " | ".join(errors))


def plan_to_events(plan: Plan) -> list[dict]:
    return [
        {
            "agent_id": task.agent_id,
            "role": task.role,
            "state": "WORKING",
            "task_description": task.task_description,
        }
        for task in plan.subtasks
    ]


ANIMATION_PROMPT = (
    "Kamu adalah Animator dan Compositor di sebuah studio animasi. Kamu menerima "
    "rancangan/isi file dari tiap divisi untuk proyek: \"{prompt}\".\n\n"
    "TUGAS: ubah rancangan itu menjadi spesifikasi animasi berformat JSON (bukan kode), "
    "yang nanti dirender oleh mesin animasi studio.\n\n"
    "Balas HANYA objek JSON valid, tanpa penjelasan dan tanpa markdown, dengan bentuk:\n"
    "{{\n"
    "  \"judul\": \"judul singkat animasi\",\n"
    "  \"palet\": {{\"langit\": \"#7ec8e3\", \"tanah\": \"#3a7d3a\", \"aksen\": \"#ffd166\"}},\n"
    "  \"aktor\": [\n"
    "    {{\"id\": \"kucing\", \"emoji\": \"🐱\", \"bentuk\": \"hewan\", \"warna\": \"#e74c3c\", \"r\": 16}}\n"
    "  ],\n"
    "  \"dekor\": [\n"
    "    {{\"emoji\": \"🌳\", \"x\": 120, \"y\": 380, \"ukuran\": 48}}\n"
    "  ],\n"
    "  \"adegan\": [\n"
    "    {{\"durasi\": 1.2, \"teks\": \"narasi singkat Bahasa Indonesia\",\n"
    "      \"latar\": \"#8ecae6\",\n"
    "      \"posisi\": [{{\"id\": \"kucing\", \"x\": 150, \"y\": 350}}]}}\n"
    "  ]\n"
    "}}\n\n"
    "PENTING - sesuaikan visual dengan permintaan pengguna:\n"
    "- Sesuai permintaan, `emoji` tiap aktor harus emoji tunggal yang paling mewakili "
    "subjeknya (mis. 🐱 kucing, 🤖 robot, 🚗 mobil, 🧑/⚽ pemain & bola, 🌷 bunga). "
    "Ini yang menentukan tampilan tokoh, jadi pilih yang benar.\n"
    "- `bentuk` pilih salah satu: manusia, hewan, kendaraan, benda, tumbuhan, bangunan, "
    "bola, atau lainnya.\n"
    "- `dekor` = benda latar statis khas permintaan (pohon, awan, rumah, gawang, gedung, "
    "matahari, dll) supaya latar sesuai cerita.\n"
    "- `r` <= 10 untuk benda kecil seperti bola; koordinat x/y dalam kanvas 800x450 "
    "(y = titik kaki/base); posisikan aktor mengikuti tiap panel storyboard dari awal "
    "sampai akhir; buat 4-8 adegan."
)


class AnimActor(BaseModel):
    id: str = Field(description="ID tokoh/benda, mis. penendang/kiper/bola")
    emoji: str = Field(default="", description="Satu emoji yang mewakili subjek, mis. 🐱")
    bentuk: str = Field(default="manusia", description="manusia/hewan/kendaraan/benda/…")
    warna: str = Field(default="#ffffff", description="Warna hex, mis. #e74c3c")
    r: float = Field(default=16, description="Radius; <=10 untuk benda kecil seperti bola")


class AnimDekor(BaseModel):
    emoji: str = Field(default="🌳", description="Emoji benda latar, mis. 🌳")
    x: float = Field(default=400, description="Koordinat x (kanvas 800)")
    y: float = Field(default=380, description="Koordinat y (titik base, kanvas 450)")
    ukuran: float = Field(default=48, description="Ukuran emoji dalam piksel")


class AnimPos(BaseModel):
    id: str = Field(description="ID aktor")
    x: float = Field(description="Koordinat x (kanvas 800)")
    y: float = Field(description="Koordinat y (titik kaki/base, kanvas 450)")


class AnimScene(BaseModel):
    durasi: float = Field(default=1.0, description="Durasi adegan dalam detik")
    teks: str = Field(default="", description="Narasi singkat adegan")
    latar: str | None = Field(default=None, description="Warna latar hex opsional")
    posisi: list[AnimPos] = Field(default_factory=list, description="Posisi aktor")


class AnimSpec(BaseModel):
    judul: str = Field(default="Animasi", description="Judul animasi")
    palet: dict[str, str] = Field(default_factory=dict, description="Warna latar")
    aktor: list[AnimActor] = Field(default_factory=list, description="Daftar tokoh/benda")
    dekor: list[AnimDekor] = Field(default_factory=list, description="Benda latar statis")
    adegan: list[AnimScene] = Field(default_factory=list, description="Daftar adegan")


def _strip_code_fence(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _extract_json(text: str) -> dict:
    text = _strip_code_fence(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _spec_to_render(spec: AnimSpec) -> dict:
    return {
        "judul": spec.judul,
        "palet": spec.palet,
        "aktor": [a.model_dump() for a in spec.aktor],
        "dekor": [d.model_dump() for d in spec.dekor],
        "adegan": [
            {
                "durasi": s.durasi,
                "teks": s.teks,
                "latar": s.latar,
                "posisi": {p.id: [p.x, p.y] for p in s.posisi},
            }
            for s in spec.adegan
        ],
    }


async def write_animation_spec(prompt: str, files: dict[str, str]) -> dict:
    """Susun spesifikasi animasi (judul, palet, aktor, adegan) dari rancangan divisi."""
    limit = int(os.getenv("STUDIO_CONTEXT_CHARS", "700"))
    sections = "\n\n".join(
        f"### Divisi `{agent_id}`\n{content[:limit]}" for agent_id, content in files.items()
    )
    user = f"Rancangan tiap divisi:\n\n{sections}\n\nSusun spesifikasi animasinya sekarang (JSON saja)."
    errors = []
    for model in MODELS:
        try:
            completion = await client.chat.completions.create(
                model=model,
                max_tokens=ANIM_MAX_TOKENS,
                messages=[
                    {"role": "system", "content": ANIMATION_PROMPT.format(prompt=prompt)},
                    {"role": "user", "content": user},
                ],
            )
            data = _extract_json(completion.choices[0].message.content or "")
            spec = AnimSpec.model_validate(data)
            if spec.adegan:
                return _spec_to_render(spec)
            errors.append(f"{model}: adegan kosong")
        except Exception as exc:
            errors.append(f"{model}: {exc}")
    raise RuntimeError("Semua model gagal -> " + " | ".join(errors))
