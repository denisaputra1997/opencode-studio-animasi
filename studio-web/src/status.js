export const STATUS_META = {
  idle: { label: "IDLE", color: "#94a3b8" },
  working: { label: "WORKING", color: "#34d399" },
  thinking: { label: "THINKING", color: "#60a5fa" },
  done: { label: "DONE", color: "#fbbf24" },
  blocked: { label: "BLOCKED", color: "#f87171" },
  meeting: { label: "MEETING", color: "#c084fc" },
};

export const STATUS_ORDER = ["idle", "working", "thinking", "done", "blocked", "meeting"];

export const AGENT_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#a855f7",
  "#f59e0b",
  "#14b8a6",
  "#ec4899",
  "#6366f1",
  "#84cc16",
];

export const SKIN_COLORS = ["#f2c9a0", "#e8b98d", "#d9a06b", "#b07a4a", "#8d5524"];
export const HAIR_COLORS = ["#3e2723", "#212121", "#5d4037", "#4e342e", "#d4a017"];

export function meta(status) {
  return STATUS_META[status] || STATUS_META.idle;
}
