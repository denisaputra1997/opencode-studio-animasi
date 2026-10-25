export const API_BASE = (import.meta.env?.VITE_STUDIO_API || "http://localhost:8787").replace(
  /\/+$/,
  ""
);

async function errorMessage(response) {
  try {
    const data = await response.json();
    return data.detail || data.error || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export async function scanProject(projectPath, logFile) {
  const payload = { projectPath };
  if (logFile) payload.logFile = logFile;
  const response = await fetch(`${API_BASE}/api/scan-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export async function setAgentStatus(agent, status) {
  const response = await fetch(`${API_BASE}/api/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent, status }),
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json();
}

export function eventsUrl(projectPath) {
  return `${API_BASE}/api/events?projectPath=${encodeURIComponent(projectPath)}`;
}
