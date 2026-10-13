import os

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8080/v1")
API_KEY = os.getenv("LLM_API_KEY", "aigate-local")
MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", "1000"))

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
