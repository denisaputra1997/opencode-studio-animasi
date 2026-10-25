import asyncio
import json
import os
import re

from openai import AsyncOpenAI
from pydantic import BaseModel, Field, field_validator

from app.subagents import available_divisions, find_subagent, subagent_persona

BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080/v1")
API_KEY = os.getenv("LLM_API_KEY", "aigate-local")
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "700"))
ANIM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS_ANIM", "2000"))

DEFAULT_MODELS = [
    "provider:qrog1:qwen/qwen3.8-27b",
    "provider:gemini-1.5-flash:models/gemini-3.5-flash",
]
MODELS = [m.strip() for m in os.getenv("LLM_MODEL", ",".join(DEFAULT_MODELS)).split(",") if m.strip()]

SYSTEM_PROMPT = (
    "Kamu adalah masteragent di sebuah studio animasi. Terima prompt proyek dari "
    "pengguna, lalu pecah menjadi beberapa sub-tugas untuk sub-agent. Untuk setiap "
    "sub-tugas tentukan: agent_id = nama divisi huruf kecil dengan tanda hubung, "
    "role = nama divisi yang mudah dibaca sesuai jenis tugasnya, dan "
    "task_description singkat dalam Bahasa Indonesia. Pilih divisi yang paling cocok "
    "dengan tugas itu."
)


def _system_prompt() -> str:
    divisions = available_divisions()
    listing = ", ".join(f"{item['id']} ({item['role']})" for item in divisions)
    return (
        f"{SYSTEM_PROMPT}\n\nDivisi yang tersedia di .opencode/agents/SubAgent: "
        f"{listing}. Utamakan divisi tersebut; jangan membuat nama baru bila sudah "
        "ada yang cocok."
    )

LLM_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "20"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "0"))

client = AsyncOpenAI(
    api_key=API_KEY,
    base_url=BASE_URL,
    timeout=LLM_TIMEOUT,
    max_retries=LLM_MAX_RETRIES,
)


async def _call_llm(**kwargs):
    """Panggil LLM dengan timeout keras supaya model yang hang cepat di-skip."""
    return await asyncio.wait_for(
        client.chat.completions.create(**kwargs), timeout=LLM_TIMEOUT
    )


async def _call_llm_parse(**kwargs):
    """Varian structured-output (beta parse) dengan timeout keras."""
    return await asyncio.wait_for(
        client.beta.chat.completions.parse(**kwargs), timeout=LLM_TIMEOUT
    )


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


DEFAULT_SUBTASKS = [
    ("storyboard", "Storyboard Artist", "Menyusun storyboard dan alur adegan"),
    ("designer", "Character Designer", "Mendesain karakter utama"),
    ("background", "Background Artist", "Membuat latar dan suasana adegan"),
    ("animator", "Animator", "Menganimasikan gerakan tiap adegan"),
    ("colorist", "Colorist", "Mewarnai dan mengatur pencahayaan"),
    ("compositor", "Compositor", "Menggabungkan layer dan efek"),
]


def fallback_plan(prompt: str) -> Plan:
    """Rencana cadangan bila LLM tidak tersedia, supaya proyek tetap jalan."""
    divisions = available_divisions() or [
        {"id": aid, "role": role, "description": task}
        for aid, role, task in DEFAULT_SUBTASKS
    ]
    return Plan(
        subtasks=[
            SubTask(
                agent_id=item["id"],
                role=item["role"],
                task_description=f"{item['description']} untuk: {prompt[:60]}",
            )
            for item in divisions
        ]
    )


def _canonicalize(plan: Plan) -> Plan:
    """Pakai id/role dari .opencode/agents/SubAgent bila namanya cocok."""
    for task in plan.subtasks:
        match = find_subagent(task.agent_id) or find_subagent(task.role)
        if match:
            task.agent_id = match["id"]
            task.role = match["role"]
    return plan


def _token_limits(cap: int) -> list[int]:
    """Cap token bertingkat: kalau kena limit per-menit, coba cap lebih kecil."""
    limits = [cap]
    for smaller in (cap // 2, 600, 300):
        if 0 < smaller < limits[-1]:
            limits.append(smaller)
    return limits


async def make_plan(prompt: str) -> Plan:
    errors = []
    for model in MODELS:
        for cap in _token_limits(MAX_TOKENS):
            try:
                completion = await _call_llm_parse(
                    model=model,
                    max_tokens=cap,
                    messages=[
                        {"role": "system", "content": _system_prompt()},
                        {"role": "user", "content": prompt},
                    ],
                    response_format=Plan,
                )
                plan = completion.choices[0].message.parsed
                if plan and plan.subtasks:
                    return _canonicalize(plan)
                errors.append(f"{model}: rencana kosong")
                break
            except Exception as exc:
                errors.append(f"{model}@{cap}: {exc}")
    return _canonicalize(fallback_plan(prompt))


async def write_asset(role: str, task: str, prompt: str, persona: str = "") -> str:
    """Buat isi file deliverable untuk satu divisi lewat LLM."""
    errors = []
    system = ASSET_PROMPT.format(role=role, prompt=prompt, task=task)
    if persona:
        system += f"\n\nPersona divisi (dari .opencode/agents/SubAgent):\n{persona[:1600]}"
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": "Tulis deliverable-nya sekarang."},
    ]
    for model in MODELS:
        for cap in _token_limits(MAX_TOKENS):
            try:
                completion = await _call_llm(
                    model=model,
                    max_tokens=cap,
                    messages=messages,
                )
                content = (completion.choices[0].message.content or "").strip()
                if content:
                    return content
                errors.append(f"{model}@{cap}: jawaban kosong")
                break
            except Exception as exc:
                errors.append(f"{model}@{cap}: {exc}")
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
    "      \"posisi\": {{\"kucing\": [150.0, 350.0]}}}}\n"
    "  ]\n"
    "}}\n\n"
    "PENTING - sesuaikan visual dengan permintaan pengguna:\n"
    "- `posisi` HARUS berbentuk object mapping id-> [x,y] (BUKAN array). Sangat penting.\n"
    "- Sesuai permintaan, `emoji` tiap aktor harus emoji tunggal yang paling mewakili "
    "subjeknya (mis. 🐱 kucing, 🤖 robot, 🚗 mobil, 🧑/⚽ pemain & bola, 🌷 bunga). "
    "- `bentuk` pilih salah satu: manusia, hewan, kendaraan, benda, tumbuhan, bangunan, "
    "bola, atau lainnya.\n"
    "- `dekor` = benda latar statis khas permintaan (pohon, awan, rumah, gawang, gedung, "
    "matahari, dll).\n"
    "- `r` <= 10 untuk benda kecil seperti bola; koordinat x/y dalam kanvas 800x450 "
    "(y = titik kaki/base); posisikan aktor mengikuti tiap panel storyboard dari awal "
    "sampai akhir; buat 4-8 adegan.\n"
    "- Balas HANYA JSON valid. Jangan tambahkan teks lain."
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
    posisi: list[AnimPos] | dict = Field(default_factory=dict, description="Posisi aktor")

    @field_validator("posisi", mode="before")
    @classmethod
    def _coerce_pos(cls, v):
        if v is None:
            return {}
        if isinstance(v, dict):
            return v
        if isinstance(v, list):
            out = {}
            for item in v:
                if isinstance(item, dict):
                    if "id" in item and ("x" in item and "y" in item):
                        try:
                            out[str(item["id"])] = [float(item["x"]), float(item["y"])]
                        except Exception:
                            pass
                    elif len(item) >= 3:
                        try:
                            out[str(item[0])] = [float(item[1]), float(item[2])]
                        except Exception:
                            pass
            return out
        return v


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


ACTOR_RULES = [
    (["panah", "arrow", "busur"], {"id": "panah", "emoji": "🏹", "bentuk": "benda", "warna": "#D2B48C", "r": 12}),
    (["kucing", "cat"], {"id": "kucing", "emoji": "🐱", "bentuk": "hewan", "warna": "#FFB74D", "r": 16}),
    (["anjing", "dog"], {"id": "anjing", "emoji": "🐶", "bentuk": "hewan", "warna": "#A1887F", "r": 16}),
    (["kelinci", "rabbit", "bunny"], {"id": "kelinci", "emoji": "🐰", "bentuk": "hewan", "warna": "#E0E0E0", "r": 15}),
    (["kuda", "horse"], {"id": "kuda", "emoji": "🐴", "bentuk": "hewan", "warna": "#8D6E63", "r": 18}),
    (["gajah", "elephant"], {"id": "gajah", "emoji": "🐘", "bentuk": "hewan", "warna": "#90A4AE", "r": 20}),
    (["singa", "lion"], {"id": "singa", "emoji": "🦁", "bentuk": "hewan", "warna": "#FBC02D", "r": 18}),
    (["harimau", "tiger"], {"id": "harimau", "emoji": "🐯", "bentuk": "hewan", "warna": "#FB8C00", "r": 18}),
    (["panda", "beruang", "bear"], {"id": "beruang", "emoji": "🐻", "bentuk": "hewan", "warna": "#6D4C41", "r": 18}),
    (["monyet", "monkey"], {"id": "monyet", "emoji": "🐵", "bentuk": "hewan", "warna": "#A1887F", "r": 15}),
    (["kupu", "butterfly"], {"id": "kupu", "emoji": "🦋", "bentuk": "hewan", "warna": "#42A5F5", "r": 12}),
    (["lebah", "bee"], {"id": "lebah", "emoji": "🐝", "bentuk": "hewan", "warna": "#FDD835", "r": 10}),
    (["ikan", "fish"], {"id": "ikan", "emoji": "🐟", "bentuk": "hewan", "warna": "#4FC3F7", "r": 14}),
    (["burung", "bird"], {"id": "burung", "emoji": "🐦", "bentuk": "hewan", "warna": "#4FC3F7", "r": 14}),
    (["dinosaurus", "dino"], {"id": "dino", "emoji": "🦖", "bentuk": "hewan", "warna": "#43A047", "r": 20}),
    (["orang", "manusia", "anak", "pemain"], {"id": "orang", "emoji": "🧍", "bentuk": "manusia", "warna": "#90CAF9", "r": 16}),
    (["robot", "bot"], {"id": "robot", "emoji": "🤖", "bentuk": "benda", "warna": "#90A4AE", "r": 18}),
    (["mobil", "car", "kendaraan"], {"id": "mobil", "emoji": "🚗", "bentuk": "kendaraan", "warna": "#E53935", "r": 18}),
    (["bola", "ball"], {"id": "bola", "emoji": "⚽", "bentuk": "bola", "warna": "#FFFFFF", "r": 9}),
    (["bunga", "flower"], {"id": "bunga", "emoji": "🌷", "bentuk": "tumbuhan", "warna": "#E91E63", "r": 14}),
    (["matahari", "sun"], {"id": "matahari", "emoji": "☀️", "bentuk": "benda", "warna": "#FFD54F", "r": 18}),
    (["pesawat", "plane"], {"id": "pesawat", "emoji": "✈️", "bentuk": "kendaraan", "warna": "#90CAF9", "r": 18}),
]


def _detect_actor(prompt: str) -> dict:
    """Tebak aktor utama dari prompt (fallback), pakai batas kata agar akurat."""
    p = prompt.lower()
    for words, actor in ACTOR_RULES:
        if any(re.search(rf"\b{re.escape(w)}\b", p) for w in words):
            return dict(actor)
    return {"id": "tokoh", "emoji": "🧍", "bentuk": "manusia", "warna": "#90CAF9", "r": 16}


def _extract_json(text: str) -> dict:
    text = _strip_code_fence(text)
    # coba langsung
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # cari blok json pertama
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except Exception:
            pass
    # coba perbaiki petik tunggal / trailing comma simpel
    try:
        t2 = text.replace("'", '"')
        # hapus trailing comma sebelum ] atau }
        import re

        t2 = re.sub(r",\s*([\]}])", r"\1", t2)
        start = t2.find("{")
        end = t2.rfind("}")
        if start != -1 and end > start:
            return json.loads(t2[start : end + 1])
    except Exception:
        pass
    raise


def _spec_to_render(spec: AnimSpec) -> dict:
    adegan_out = []
    for s in spec.adegan:
        pos = s.posisi
        if isinstance(pos, list):
            pos_map = {}
            for p in pos:
                try:
                    pos_map[p.id] = [p.x, p.y]
                except Exception:
                    pass
        elif isinstance(pos, dict):
            pos_map = {}
            for k, v in pos.items():
                if isinstance(v, (list, tuple)) and len(v) >= 2:
                    try:
                        pos_map[str(k)] = [float(v[0]), float(v[1])]
                    except Exception:
                        pass
                elif isinstance(v, dict) and "x" in v and "y" in v:
                    try:
                        pos_map[str(k)] = [float(v["x"]), float(v["y"])]
                    except Exception:
                        pass
        else:
            pos_map = {}
        adegan_out.append(
            {
                "durasi": s.durasi,
                "teks": s.teks,
                "latar": s.latar,
                "posisi": pos_map,
            }
        )
    return {
        "judul": spec.judul,
        "palet": spec.palet,
        "aktor": [a.model_dump() for a in spec.aktor],
        "dekor": [d.model_dump() for d in spec.dekor],
        "adegan": adegan_out,
    }


async def write_animation_spec(prompt: str, files: dict[str, str]) -> dict:
    """Susun spesifikasi animasi (judul, palet, aktor, adegan) dari rancangan divisi."""
    limit = int(os.getenv("STUDIO_CONTEXT_CHARS", "900"))
    sections = "\n\n".join(
        f"### Divisi `{agent_id}`\n{content[:limit]}" for agent_id, content in files.items()
    )
    user = f"Rancangan tiap divisi:\n\n{sections}\n\nSusun spesifikasi animasinya sekarang (JSON saja)."
    system = ANIMATION_PROMPT.format(prompt=prompt)
    persona = subagent_persona("compositor")
    if persona:
        system += f"\n\nPersona Compositor (dari .opencode/agents/SubAgent):\n{persona[:1200]}"
    errors = []
    for model in MODELS:
        for cap in _token_limits(ANIM_MAX_TOKENS):
            try:
                completion = await _call_llm(
                    model=model,
                    max_tokens=cap,
                    temperature=0.2,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                )
                content = completion.choices[0].message.content or ""
                data = _extract_json(content)
                spec = AnimSpec.model_validate(data)
                if spec.adegan:
                    return _spec_to_render(spec)
                errors.append(f"{model}@{cap}: adegan kosong")
                break
            except Exception as exc:
                errors.append(f"{model}@{cap}: {exc}")
    return _fallback_spec(prompt, files)


def _decor_for(prompt: str) -> list[dict]:
    p = prompt.lower()
    if re.search(r"\b(laut|ikan|pantai|bawah laut|akuarium)\b", p):
        return [
            {"emoji": "🪸", "x": 110, "y": 415, "ukuran": 56},
            {"emoji": "🪸", "x": 690, "y": 420, "ukuran": 48},
            {"emoji": "🫧", "x": 220, "y": 180, "ukuran": 22},
            {"emoji": "🫧", "x": 600, "y": 140, "ukuran": 16},
        ]
    if re.search(r"\b(kota|gedung|jalan|malam)\b", p):
        return [
            {"emoji": "🏢", "x": 120, "y": 380, "ukuran": 64},
            {"emoji": "🏢", "x": 300, "y": 380, "ukuran": 56},
            {"emoji": "🌙", "x": 660, "y": 80, "ukuran": 44},
        ]
    if re.search(r"\b(ruang|kamar|rumah|dalam)\b", p):
        return [
            {"emoji": "🪴", "x": 120, "y": 400, "ukuran": 44},
            {"emoji": "🖼️", "x": 300, "y": 200, "ukuran": 44},
        ]
    return [
        {"emoji": "🌳", "x": 100, "y": 385, "ukuran": 52},
        {"emoji": "🌷", "x": 660, "y": 405, "ukuran": 36},
        {"emoji": "☁️", "x": 250, "y": 90, "ukuran": 40},
        {"emoji": "☀️", "x": 650, "y": 70, "ukuran": 46},
    ]


def _narration_lines(files: dict[str, str]) -> list[str]:
    """Ambil baris narasi/panel dari storyboard sebagai teks adegan fallback."""
    text = ""
    for name, content in files.items():
        if "storyboard" in name.lower():
            text = content
            break
    if not text:
        text = next(iter(files.values()), "")
    lines = []
    for raw in text.splitlines():
        line = re.sub(r"^[#>*\-\d.\s|]+", "", raw).strip()
        line = re.sub(r"[*_`]+", "", line).strip()
        if 18 <= len(line) <= 120 and not line.lower().startswith(("proyek:", "divisi:", "tugas:", "dibuat:")):
            lines.append(line)
        if len(lines) >= 6:
            break
    return lines


def _fallback_spec(prompt: str, files: dict[str, str]) -> dict:
    """Spesifikasi animasi cadangan yang tetap sesuai prompt & storyboard."""
    actor = _detect_actor(prompt + "\n" + " ".join(list(files.values())[:1]))
    lines = _narration_lines(files)
    path = [[140, 320], [280, 300], [420, 330], [560, 360], [700, 320], [740, 300]]
    adegan = []
    for i, (x, y) in enumerate(path):
        teks = lines[i] if i < len(lines) else f"{prompt[:50]} — bagian {i + 1}"
        adegan.append(
            {
                "durasi": 1.2,
                "teks": teks,
                "latar": "#8ecae6" if i % 2 == 0 else "#a2d2ff",
                "posisi": {actor["id"]: [float(x), float(y)]},
            }
        )
    spec_fb = {
        "judul": f"Animasi - {prompt[:48]}",
        "palet": {"langit": "#8ecae6", "tanah": "#3a7d3a", "aksen": "#ffd166"},
        "aktor": [actor],
        "dekor": _decor_for(prompt),
        "adegan": adegan,
    }
    return _spec_to_render(AnimSpec.model_validate(spec_fb))
