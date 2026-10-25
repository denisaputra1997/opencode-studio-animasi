import { STATUS_ORDER, meta } from "../status.js";

function Counts({ counts }) {
  const items = STATUS_ORDER.filter((status) => counts && counts[status] > 0);
  return (
    <div className="counts">
      {items.length === 0 ? <span className="muted">semua idle</span> : null}
      {items.map((status) => (
        <span key={status} className="count-pill" style={{ borderColor: meta(status).color }}>
          <i style={{ background: meta(status).color }} />
          {counts[status]} {meta(status).label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

function AgentCard({ agent, selected, onSelect }) {
  const status = meta(agent.status);
  return (
    <button
      type="button"
      className={`agent-card${selected ? " selected" : ""}`}
      onClick={() => onSelect(agent.id)}
    >
      <span className="dot" style={{ background: status.color }} />
      <span className="agent-card-text">
        <span className="agent-name">
          {agent.name}
          {agent.is_master ? <em className="badge">master</em> : null}
        </span>
        <span className="agent-role">{agent.role}</span>
      </span>
      <span className="agent-status" style={{ color: status.color }}>
        {status.label}
      </span>
    </button>
  );
}

export default function AgentPanel({ state, selectedId, onSelect, onChangeStatus }) {
  const all = [...(state.masteragent ? [state.masteragent] : []), ...state.agents];
  const selected = all.find((agent) => agent.id === selectedId) || all[0];
  const counts = state.counts || {};

  return (
    <div className="panel-body">
      <Counts counts={counts} />

      <div className="agent-list">
        {all.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={selected && agent.id === selected.id}
            onSelect={onSelect}
          />
        ))}
      </div>

      {selected ? (
        <div className="agent-detail">
          <div className="detail-head">
            <span className="dot" style={{ background: meta(selected.status).color }} />
            <strong>{selected.name}</strong>
            <span className="desk-id">meja #{selected.desk_id}</span>
          </div>
          <dl>
            <dt>Role</dt>
            <dd>{selected.role}</dd>
            <dt>Status</dt>
            <dd style={{ color: meta(selected.status).color }}>{meta(selected.status).label}</dd>
            <dt>Mode</dt>
            <dd>{selected.mode || "—"}</dd>
            <dt>Model</dt>
            <dd>{selected.model || "—"}</dd>
            <dt>Berkas</dt>
            <dd>
              <code>{selected.file}</code>
            </dd>
          </dl>
          {selected.description ? <p className="description">{selected.description}</p> : null}

          <div className="status-actions">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                className={selected.status === status ? "active" : ""}
                style={{ "--status-color": meta(status).color }}
                onClick={() => onChangeStatus(selected.id, status)}
              >
                {meta(status).label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.warnings && state.warnings.length > 0 ? (
        <div className="warnings">
          <strong>Peringatan</strong>
          <ul>
            {state.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
