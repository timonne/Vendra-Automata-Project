import { useEffect, useId, useRef, useState } from "react";
import { type Automaton, type State } from "./fsm";
import Icon from "./Icon";

export default function Diagram({
  machine,
  cursor,
  onState,
  compact = false,
  invalid = false,
}: {
  machine: Automaton;
  cursor: number;
  onState: (state: State) => void;
  compact?: boolean;
  invalid?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMoore = machine.type === "Moore";
  const active = machine.transitions[cursor - 1]?.to ?? machine.initial;
  const visited = new Set([
    machine.initial,
    ...machine.transitions.slice(0, cursor).map((e) => e.to),
  ]);
  const n = machine.states.length;
  const cols = isMoore ? 3 : 3;
  const rows = Math.ceil(n / cols);
  const releases = machine.transitions.filter((edge) => edge.kind === "release").length;
  const height = isMoore ? Math.max(338, rows * 158 + 45) : Math.max(395, 368 + releases * 12);
  const positions = machine.states.map((_, i) => {
    const row = Math.floor(i / cols),
      col = i % cols;
    return { x: 82 + (row % 2 ? 2 - col : col) * 168, y: 100 + row * 158 };
  });
  useEffect(() => {
    const container = scrollRef.current;
    const svg = container?.querySelector("svg");
    const pos = positions[machine.states.findIndex((state) => state.id === active)];
    if (!container || !svg || !pos) return;
    const event = machine.transitions[cursor - 1];
    const releaseIndex = machine.transitions
      .filter((edge) => edge.kind === "release")
      .findIndex((edge) => edge.order === event?.order);
    // Keep the actual release label visible as well as its shared S3 state.
    const focusY = !isMoore && event?.kind === "release" ? pos.y + 90 + releaseIndex * 12 : pos.y;
    const y = (focusY / height) * svg.clientHeight;
    if (y < container.scrollTop + 50 || y > container.scrollTop + container.clientHeight - 70) {
      container.scrollTop = Math.max(0, y - container.clientHeight / 2);
    }
  }, [active, cursor, machine.type, machine.states.length, zoom]);
  // Parallel guarded transitions share an arrow; every input/output label is
  // still rendered. This is important for repeated selections and releases.
  const groups = new Map<string, typeof machine.transitions>();
  machine.transitions.forEach((edge) => {
    const key = `${edge.from}-${edge.to}`;
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  });
  return (
    <div className={`diagram-container ${compact ? "compact" : ""}`}>
      <div className="diagram-scroll" ref={scrollRef}>
        <svg
          className="automaton-svg"
          viewBox={`0 0 500 ${height}`}
          style={{ width: `${zoom * 100}%`, minWidth: compact ? 310 : 420 }}
          role="img"
          aria-label={`Dynamic ${machine.type} automaton with ${n} states`}
        >
          <defs>
            {["muted", "active", "visited"].map((kind) => (
              <marker
                key={kind}
                id={`${uid}-${kind}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path
                  d="M 0 0 L 10 5 L 0 10 z"
                  fill={kind === "active" ? "#7DFF9A" : kind === "visited" ? "#5f997b" : "#546279"}
                />
              </marker>
            ))}
          </defs>
          <path d="M12 100H43" className="edge" markerEnd={`url(#${uid}-muted)`} />
          <text x="18" y="89" className="initial-label">
            start
          </text>
          {[...groups.values()].map((edges) => {
            const edge = edges[0];
            const a = positions[machine.states.findIndex((s) => s.id === edge.from)];
            const b = positions[machine.states.findIndex((s) => s.id === edge.to)];
            if (!a || !b) return null;
            const current = edges.some((e) => e.order === cursor - 1);
            const done = edges.every((e) => e.order < cursor);
            const tone = current ? "active" : done ? "visited" : "muted";
            const loop = edge.from === edge.to;
            const sameRow = a.y === b.y;
            const direction = b.x >= a.x ? 1 : -1;
            let d: string, tx: number, ty: number;
            if (loop && edge.kind === "release") {
              d = `M${a.x - 23},${a.y + 26} C${a.x - 70},${a.y + 99} ${a.x + 70},${a.y + 99} ${a.x + 23},${a.y + 26}`;
              tx = a.x;
              ty = a.y + 90;
            } else if (loop) {
              d = `M${a.x - 23},${a.y - 26} C${a.x - 70},${a.y - 99} ${a.x + 70},${a.y - 99} ${a.x + 23},${a.y - 26}`;
              tx = a.x;
              ty = a.y - 87;
            } else if (sameRow) {
              d = `M${a.x + direction * 38},${a.y} L${b.x - direction * 39},${b.y}`;
              tx = (a.x + b.x) / 2;
              ty = a.y + 24;
            } else if (a.x === b.x) {
              d = `M${a.x},${a.y + 38} L${b.x},${b.y - 39}`;
              tx = a.x - 57;
              ty = (a.y + b.y) / 2;
            } else {
              d = `M${a.x},${a.y + 38} C${a.x},${b.y - 50} ${b.x},${a.y + 50} ${b.x},${b.y - 39}`;
              tx = (a.x + b.x) / 2;
              ty = (a.y + b.y) / 2;
            }
            const labels = edges.map((e) => `${e.input}${isMoore ? "" : ` / ${e.output}`}`);
            return (
              <g key={edge.id}>
                <path d={d} className={`edge ${tone}`} markerEnd={`url(#${uid}-${tone})`} />
                {labels.map((label, i) => (
                  <text
                    key={i}
                    x={tx}
                    y={ty + i * (label.length > 24 && !isMoore ? 24 : 12)}
                    className={`edge-label ${edges[i].order === cursor - 1 ? "active" : edges[i].order < cursor ? "visited" : "muted"}`}
                    textAnchor="middle"
                  >
                    {label.length > 24 && !isMoore ? (
                      <>
                        <tspan x={tx}>{edges[i].input} /</tspan>
                        <tspan x={tx} dy="11">
                          {edges[i].output}
                        </tspan>
                      </>
                    ) : (
                      label
                    )}
                  </text>
                ))}
              </g>
            );
          })}
          {/* Reset is a user-triggered transaction boundary, not an autoplay event. */}
          {n > 1 && (
            <g opacity=".65">
              <path
                d={`M${positions[n - 1].x - 25} ${positions[n - 1].y + 29} Q8 ${height + 5} 9 ${height - 55} V145 Q9 100 43 100`}
                className="edge reset-edge"
                markerEnd={`url(#${uid}-muted)`}
              />
              <text x="85" y={height - 10} className="edge-label">
                Reset{isMoore ? "" : " / Clear transaction"}
              </text>
            </g>
          )}
          {machine.states.map((state, i) => {
            const p = positions[i];
            const status =
              active === state.id ? "current" : visited.has(state.id) ? "completed" : "";
            return (
              <g
                key={state.id}
                className={`state-node ${status} ${state.introduced ? "introduced" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${state.id}, ${state.name}${state.output ? `, output ${state.output}` : ""}`}
                onClick={() => onState(state)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onState(state);
                  }
                }}
              >
                <circle cx={p.x} cy={p.y} r="36" />
                {state.name === "COMPLETE" && (
                  <circle cx={p.x} cy={p.y} r="31" className="final-ring" />
                )}
                <text x={p.x} y={p.y - 3} className="state-id" textAnchor="middle">
                  {state.id}
                </text>
                <text x={p.x} y={p.y + 13} className="state-name" textAnchor="middle">
                  {state.name}
                </text>
                {isMoore && (
                  <text x={p.x} y={p.y + 54} className="state-output" textAnchor="middle">
                    {state.output}
                  </text>
                )}
                {state.introduced && (
                  <circle cx={p.x + 28} cy={p.y - 26} r="4" className="new-state-dot" />
                )}
              </g>
            );
          })}
          {invalid &&
            (() => {
              const p = positions[machine.states.findIndex((state) => state.id === active)];
              return (
                <g className="rejected-transition">
                  <path
                    d={`M${p.x - 26} ${p.y + 28} C${p.x - 60} ${p.y + 85} ${p.x + 60} ${p.y + 85} ${p.x + 26} ${p.y + 28}`}
                    fill="none"
                    stroke="#ff6464"
                    strokeDasharray="3 3"
                  />
                  <text x={p.x} y={p.y + 82} textAnchor="middle" fill="#ff8585" fontSize="8">
                    Input rejected / no change
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>
      {!compact && (
        <div className="diagram-legend">
          <span>
            <i className="legend-dot active" /> Current
          </span>
          <span>
            <i className="legend-dot visited" /> Visited
          </span>
          <span>
            <i className="legend-dot" /> Unvisited
          </span>
          <div className="zoom-controls">
            <button title="Zoom out" onClick={() => setZoom(Math.max(0.8, zoom - 0.2))}>
              <Icon name="minus" size={13} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button title="Zoom in" onClick={() => setZoom(Math.min(2, zoom + 0.2))}>
              <Icon name="plus" size={13} />
            </button>
            <button title="Reset zoom" onClick={() => setZoom(1)}>
              <Icon name="expand" size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
