import { AGENT_COLORS, HAIR_COLORS, SKIN_COLORS, meta } from "../status.js";

const SPACING_X = 92;
const SPACING_Y = 82;
const PAD_X = 92;
const PAD_Y = 86;

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function hash(value) {
  let result = 0;
  for (const char of String(value || "")) result = (result * 31 + char.charCodeAt(0)) % 99991;
  return result;
}

function Character({ x, y, shirt, master, pulse }) {
  const skin = SKIN_COLORS[hash(shirt) % SKIN_COLORS.length];
  const hair = HAIR_COLORS[hash(shirt + "h") % HAIR_COLORS.length];
  return (
    <g transform={`translate(${x},${y})`} className={pulse ? "character working" : "character"}>
      <ellipse cx="0" cy="2" rx="9" ry="3" fill="#000" opacity="0.3" />
      <rect x="-6.5" y="-7" width="5" height="8" rx="1.5" fill="#263340" />
      <rect x="1.5" y="-7" width="5" height="8" rx="1.5" fill="#263340" />
      <rect x="-6" y="-19" width="12" height="13" rx="2.5" fill={shirt} />
      <rect x="-5" y="-28" width="10" height="10" rx="4" fill={skin} />
      <path d="M-5 -25 a5 4.5 0 0 1 10 0 v-2 a5 4.5 0 0 0 -10 0 z" fill={hair} />
      {master ? <path d="M-5 -29 l1.5 -5 3 3 3 -3 1.5 5 z" fill="#ffd166" /> : null}
    </g>
  );
}

function Desk({ agent, index, x, y, selected, onSelect }) {
  const { color, label } = meta(agent.status);
  const shirt = AGENT_COLORS[index % AGENT_COLORS.length];
  const name = truncate(agent.name, 15);
  const pillWidth = Math.max(58, name.length * 6.4 + 14);

  return (
    <g
      transform={`translate(${x},${y})`}
      className={`desk${selected ? " selected" : ""}`}
      onClick={() => onSelect(agent.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(agent.id);
      }}
    >
      <polygon points="0,-27 35,0 0,27 -35,0" fill="#131d27" opacity="0.85" />
      <polygon
        points="0,-22 29,0 0,22 -29,0"
        fill="#0e171f"
        stroke={selected ? "#ffd166" : "#1b2733"}
        strokeWidth={selected ? 1.5 : 1}
      />
      <ellipse cx="0" cy="18" rx="30" ry="10" fill="#000" opacity="0.28" />

      <polygon points="-30,0 0,15 0,33 -30,18" fill="#2b3745" />
      <polygon points="0,15 30,0 30,18 0,33" fill="#22303c" />
      <polygon
        points="0,-15 30,0 0,15 -30,0"
        fill="#3b4b5e"
        stroke={selected ? "#ffd166" : "#1d2833"}
        strokeWidth={selected ? 2 : 1.4}
      />

      <g transform="translate(-15,-7)">
        <rect x="-6.5" y="-6" width="15" height="11" rx="1.5" fill="#0b1118" stroke={color} strokeWidth="1.2" />
        <rect x="-4.5" y="-4" width="11" height="7" fill={color} opacity="0.32" />
        <rect x="-1" y="5" width="4" height="3" fill="#1d2833" />
      </g>

      <Character x={7} y={-9} shirt={shirt} master={agent.is_master} pulse={agent.status === "working"} />

      <circle cx="22" cy="-15" r="4" fill={color} className={agent.status === "working" ? "pulse" : ""} />

      {agent.is_master ? (
        <text className="master-tag" x="0" y="-48" textAnchor="middle">
          MASTER
        </text>
      ) : null}

      <g transform="translate(0,42)" className="label">
        <rect
          x={-pillWidth / 2}
          y={-9}
          width={pillWidth}
          height={17}
          rx={5.5}
          fill="#0b1118"
          stroke={selected ? "#ffd166" : "#1d2833"}
          strokeWidth="1"
        />
        <circle cx={-pillWidth / 2 + 8} cy={-0.5} r={2.6} fill={color} />
        <text x={2} y={2.6} textAnchor="middle">
          {name}
        </text>
      </g>

      <title>{`${agent.name} — ${agent.role} (${label})`}</title>
    </g>
  );
}

export default function StudioIsometric({ state, selectedId, onSelect }) {
  if (!state) {
    return <div className="studio-empty">Pilih path proyek lalu tekan “Scan Proyek”.</div>;
  }

  const all = [...(state.masteragent ? [state.masteragent] : []), ...state.agents];
  if (all.length === 0) {
    return <div className="studio-empty">Tidak ada agen yang ditemukan di proyek ini.</div>;
  }

  const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(all.length))));
  const rows = Math.ceil(all.length / cols);
  const width = PAD_X * 2 + (cols - 1) * SPACING_X + SPACING_X / 2 + 40;
  const height = PAD_Y * 2 + (rows - 1) * SPACING_Y + 40;

  const cells = all.map((agent, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const offset = (row % 2) * (SPACING_X / 2);
    return {
      agent,
      index,
      x: PAD_X + col * SPACING_X + offset,
      y: PAD_Y + row * SPACING_Y,
      depth: row + col,
    };
  });

  const ordered = [...cells].sort((a, b) => a.depth - b.depth);

  return (
    <div className="studio-scroll">
      <svg
        className="iso-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Studio animasi isometrik"
        style={{ minWidth: Math.min(width, 760) }}
      >
        <defs>
          <linearGradient id="floorGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16212c" />
            <stop offset="100%" stopColor="#0e1620" />
          </linearGradient>
          <pattern id="floorGrid" width="56" height="28" patternUnits="userSpaceOnUse">
            <path d="M0 14 L28 0 L56 14 L28 28 Z" fill="none" stroke="#1b2833" strokeWidth="1" />
          </pattern>
        </defs>

        <rect x="20" y="18" width={width - 40} height={height - 36} rx="26" fill="url(#floorGradient)" />
        <rect x="20" y="18" width={width - 40} height={height - 36} rx="26" fill="url(#floorGrid)" opacity="0.65" />
        <rect
          x="20"
          y="18"
          width={width - 40}
          height={height - 36}
          rx="26"
          fill="none"
          stroke="#22303c"
          strokeWidth="1.5"
        />

        {ordered.map(({ agent, index, x, y }) => (
          <Desk
            key={agent.id}
            agent={agent}
            index={index}
            x={x}
            y={y}
            selected={agent.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </svg>
    </div>
  );
}
