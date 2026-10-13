import type { Plugin } from "@opencode-ai/plugin"

const WEBHOOK = process.env.ANIMASI_WEBHOOK ?? "http://localhost:8000/events"
const ENABLED = WEBHOOK !== "off" && WEBHOOK !== "0" && WEBHOOK !== ""
const THROTTLE_MS = Number(process.env.ANIMASI_WEBHOOK_THROTTLE ?? "200")

const DIVISIONS = [
  "storyboard",
  "designer",
  "background",
  "animator",
  "colorist",
  "compositor",
  "sound",
  "editor",
]

const ROLES: Record<string, string> = {
  masteragent: "masteragent",
  storyboard: "Storyboard Artist",
  designer: "Character Designer",
  background: "Background Artist",
  animator: "Animator",
  colorist: "Colorist",
  compositor: "Compositor",
  sound: "Sound Designer",
  editor: "Editor",
}

const TOOL_LABEL: Record<string, string> = {
  bash: "menjalankan perintah",
  edit: "menulis kode",
  write: "membuat file",
  read: "membaca file",
  grep: "mencari kode",
  glob: "mencari file",
  list: "melihat folder",
  webfetch: "mengambil halaman web",
  websearch: "riset web",
  todowrite: "menyusun todo",
  task: "mendelegasikan tugas",
}

function short(value: unknown, max = 70): string {
  if (value === undefined || value === null) return ""
  return String(value).replace(/\s+/g, " ").trim().slice(0, max)
}

function divisionFrom(...texts: unknown[]): string {
  for (const text of texts) {
    const lower = String(text ?? "").toLowerCase()
    const hit = DIVISIONS.find((d) => lower.includes(d))
    if (hit) return hit
  }
  return "masteragent"
}

function toolLabel(tool: string, args: any): string {
  const label = TOOL_LABEL[tool] ?? tool
  const detail = short(args?.filePath ?? args?.path ?? args?.command ?? args?.pattern ?? args?.query)
  return detail ? `${label}: ${detail}` : label
}

export const AnimasiStudioPlugin: Plugin = async () => {
  const last: Record<string, { t: number; s: string }> = {}

  const emit = async (event: {
    agent_id: string
    state: string
    task_description?: string
    progress?: number
    role?: string
  }) => {
    if (!ENABLED) return
    const prev = last[event.agent_id]
    const now = Date.now()
    if (prev && prev.s === event.state && now - prev.t < THROTTLE_MS) return
    last[event.agent_id] = { t: now, s: event.state }

    const payload = {
      role: ROLES[event.agent_id] ?? event.agent_id,
      task_description: "",
      ...event,
    }
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1500)
      await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timer)
    } catch {
      // backend mungkin belum jalan; jangan ganggu sesi opencode
    }
  }

  const master = (state: string, task: string, progress?: number) =>
    emit({ agent_id: "masteragent", state, task_description: task, progress })

  return {
    "chat.message": async (_input, output) => {
      const parts: any[] = (output as any)?.parts ?? []
      const text = parts
        .filter((p) => p?.type === "text")
        .map((p) => p.text)
        .join(" ")
      await master("WORKING", `Prompt: ${short(text) || "(kosong)"}`)
    },

    "tool.execute.before": async (input, output) => {
      const args = (output as any)?.args ?? {}
      if (input.tool === "task") {
        const div = divisionFrom(args.subagent_type, args.description, args.prompt)
        await emit({
          agent_id: div,
          state: "THINKING",
          task_description: short(args.description) || `Delegasi: ${div}`,
        })
        return
      }
      await master("WORKING", toolLabel(input.tool, args))
    },

    "tool.execute.after": async (input) => {
      const args = (input as any)?.args ?? {}
      if (input.tool === "task") {
        const div = divisionFrom(args.subagent_type, args.description, args.prompt)
        await emit({
          agent_id: div,
          state: "DONE",
          task_description: short(args.description) || `Selesai: ${div}`,
        })
        return
      }
      await master("WORKING", `Selesai ${toolLabel(input.tool, args)}`)
    },

    event: async ({ event }) => {
      const p: any = (event as any).properties ?? {}
      switch (event.type) {
        case "chat.message":
          break
        case "session.status": {
          const type = p.status?.type
          if (type === "busy") await master("WORKING", "Memproses…")
          else if (type === "retry")
            await master("BLOCKED", `Retry: ${short(p.status?.message) || "mencoba ulang"}`)
          else await master("IDLE", "Menunggu")
          break
        }
        case "session.idle":
          await master("IDLE", "Menunggu")
          break
        case "session.error":
          await master("BLOCKED", `Error: ${short(p.error?.name) || "sesi bermasalah"}`)
          break
        case "permission.updated":
        case "permission.asked":
          await master("BLOCKED", "Menunggu izin")
          break
        case "command.executed":
          await master("WORKING", `Perintah: ${short(p.name)}`)
          break
        case "todo.updated": {
          const todos: any[] = p.todos ?? []
          if (!todos.length) break
          const done = todos.filter((t) => t.status === "completed").length
          const current = todos.find((t) => t.status === "in_progress")
          await master(
            "WORKING",
            current ? short(current.content) : `Todo ${done}/${todos.length}`,
            done / todos.length
          )
          break
        }
        case "file.edited":
          await master("WORKING", `Edit ${short(p.file)}`)
          break
      }
    },
  }
}
