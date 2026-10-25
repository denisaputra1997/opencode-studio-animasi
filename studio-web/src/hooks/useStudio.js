import { useCallback, useEffect, useRef, useState } from "react";

import { eventsUrl, scanProject, setAgentStatus } from "../api.js";

const STORAGE_KEY = "opencode-studio:path";
const DEFAULT_PATH = "/home/ramnit/Documents/lalawidi/animasi";

function initialPath() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_PATH;
  } catch {
    return DEFAULT_PATH;
  }
}

export function useStudio() {
  const [projectPath, setProjectPath] = useState(initialPath);
  const [state, setState] = useState(null);
  const [connection, setConnection] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const sourceRef = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback((target) => {
    if (sourceRef.current) sourceRef.current.close();
    setConnection("connecting");

    const source = new EventSource(eventsUrl(target));
    sourceRef.current = source;

    source.addEventListener("snapshot", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!mountedRef.current) return;
        setState(data);
        setConnection("live");
        setError("");
      } catch {
        setError("Gagal membaca data realtime");
      }
    });

    source.addEventListener("empty", () => {
      if (mountedRef.current) setConnection("waiting");
    });

    source.onerror = () => {
      if (mountedRef.current) setConnection("offline");
    };
  }, []);

  const scan = useCallback(
    async (target) => {
      const value = String(target ?? "").trim();
      if (!value) {
        setError("Path proyek wajib diisi");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await scanProject(value);
        if (!mountedRef.current) return;
        setState(data);
        setProjectPath(value);
        try {
          localStorage.setItem(STORAGE_KEY, value);
        } catch {
          /* localStorage tidak tersedia */
        }
        connect(value);
      } catch (cause) {
        if (!mountedRef.current) return;
        setError(cause.message || "Gagal memindai proyek");
        setConnection("offline");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [connect]
  );

  const changeStatus = useCallback(async (agent, status) => {
    try {
      const data = await setAgentStatus(agent, status);
      if (mountedRef.current) setState(data);
    } catch (cause) {
      if (mountedRef.current) setError(cause.message || "Gagal mengubah status");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    scan(initialPath());
    return () => {
      mountedRef.current = false;
      if (sourceRef.current) sourceRef.current.close();
    };
  }, [scan]);

  return {
    projectPath,
    state,
    connection,
    loading,
    error,
    scan,
    changeStatus,
  };
}
