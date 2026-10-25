import { useState } from "react";

import AgentPanel from "./components/AgentPanel.jsx";
import PathForm from "./components/PathForm.jsx";
import StudioIsometric from "./components/StudioIsometric.jsx";
import { API_BASE } from "./api.js";
import { useStudio } from "./hooks/useStudio.js";
import { STATUS_META, STATUS_ORDER } from "./status.js";

const CONNECTION_META = {
  idle: { tone: "muted", label: "belum terhubung" },
  connecting: { tone: "warn", label: "menghubungkan…" },
  live: { tone: "ok", label: "realtime aktif" },
  offline: { tone: "bad", label: "realtime terputus" },
  waiting: { tone: "warn", label: "menunggu data" },
};

export default function App() {
  const { projectPath, state, connection, loading, error, scan, changeStatus } = useStudio();
  const [selectedId, setSelectedId] = useState("masteragent");
  const connectionMeta = CONNECTION_META[connection] || CONNECTION_META.idle;
  const total = state ? (state.counts ? state.counts.total : state.agents.length + 1) : 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>OpenCode Studio</h1>
            <p>Agent scanner &amp; isometric monitor</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="agent-total">{total} agen</span>
          <span className={`connection ${connectionMeta.tone}`}>
            <i />
            {connectionMeta.label}
          </span>
        </div>
      </header>

      <PathForm projectPath={projectPath} loading={loading} onScan={scan} />

      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      <main className="layout">
        <section className="card studio-card">
          <div className="studio-head">
            <div>
              <h2>{state && state.agentsDir ? state.agentsDir : ".opencode/agents"}</h2>
              <p className="muted">{state ? state.projectPath : "belum ada proyek aktif"}</p>
            </div>
            {state ? (
              <div className="studio-counts">
                <strong>{state.agents.length}</strong>
                <span>sub-agent</span>
              </div>
            ) : null}
          </div>

          <StudioIsometric state={state} selectedId={selectedId} onSelect={setSelectedId} />

          <footer className="studio-foot">
            <div className="legend">
              {STATUS_ORDER.map((status) => (
                <span key={status}>
                  <i style={{ background: STATUS_META[status].color }} />
                  {STATUS_META[status].label}
                </span>
              ))}
            </div>
            <span className="muted api-url">{API_BASE}</span>
          </footer>
        </section>

        <aside className="card side-card">
          <div className="side-head">
            <h2>Tim studio</h2>
            {state ? <span className="muted">meja dari .opencode</span> : null}
          </div>
          {state ? (
            <AgentPanel
              state={state}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChangeStatus={changeStatus}
            />
          ) : (
            <div className="placeholder">
              <p>Belum ada data agen.</p>
              <p className="muted">
                Masukkan path proyek yang punya folder <code>.opencode/agents/</code>.
              </p>
            </div>
          )}
        </aside>
      </main>

      <footer className="page-foot">
        Status berubah realtime dari log/status file proyek, atau lewat endpoint{" "}
        <code>POST /api/status</code>.
      </footer>
    </div>
  );
}
