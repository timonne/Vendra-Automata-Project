import { useEffect, useMemo, useState } from "react";
import Diagram from "./Diagram";
import Icon from "./Icon";
import Machine from "./Machine";
import {
  checkBackendHealth,
  apiGenerateFSM,
  apiSelectProduct,
  apiConfirmTransaction,
  apiDispenseStep,
  apiResetTransaction,
  apiConvertMealyToMoore,
  apiConvertMooreToMealy,
  type ConversionResult,
} from "./api";
import {
  PRODUCTS,
  product,
  money,
  mealyMachine,
  toMoore,
  toMealy,
  outputTrace,
  snapshot,
  type Code,
  type MachineType,
  type Automaton,
  type State,
} from "./fsm";

function ProductArt({ code, small = false }: { code: Code; small?: boolean }) {
  const p = product(code);
  return (
    <span
      className={`product-art ${small ? "small" : ""}`}
      style={{ "--product-color": p.color } as React.CSSProperties}
    >
      <svg viewBox="0 0 40 48" aria-hidden="true">
        {p.type === "bottle" ? (
          <>
            <path d="M16 5h8v8l5 7v22H11V20l5-7Z" fill={p.color} />
            <rect x="15" y="3" width="10" height="5" rx="1.5" fill="#c8d0d8" />
            <path d="M12 24h16v12H12z" fill="#fff" opacity=".85" />
            <path d="M15 17v5" stroke="#fff" opacity=".4" strokeWidth="2" />
          </>
        ) : p.type === "bag" ? (
          <>
            <path d="m9 7 4-2 4 2 4-2 4 2 5-2-2 37-4-2-4 2-4-2-5 2Z" fill={p.color} />
            <path d="m10 11 18-1M11 37h15" stroke="#fff" opacity=".4" />
            <ellipse cx="20" cy="25" rx="7" ry="6" fill="#f8d58d" />
            <path d="m16 23 8 3" stroke="#d8ac60" />
          </>
        ) : p.type === "bar" ? (
          <>
            <path d="m7 12 28 6-7 24L1 34Z" fill={p.color} />
            <path d="m10 15 20 5-5 15-20-5Z" fill="#604234" />
            <path d="m17 17-4 15m11-13-4 14M8 24l20 5" stroke="#967359" strokeWidth="1.5" />
            <path d="m3 33 25 6-1 4L0 36Z" fill="#d6eae5" />
          </>
        ) : (
          <>
            <rect x="11" y="7" width="19" height="35" rx="5" fill={p.color} />
            <ellipse cx="20.5" cy="8" rx="9.5" ry="3" fill="#d1dce1" />
            <ellipse cx="20.5" cy="8" rx="3" ry="1.5" fill="#75818a" />
            <path d="M14 14v21" stroke="#fff" opacity=".25" strokeWidth="2" />
            <path d="m24 17-9 10h6l-3 9 10-12h-7Z" fill="#fff" opacity=".85" />
          </>
        )}
      </svg>
    </span>
  );
}

function TransitionTable({ machine, cursor = 0 }: { machine: Automaton; cursor?: number }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Current state</th>
            <th>Input</th>
            <th>Next state</th>
            <th>{machine.type === "Moore" ? "State output (on entry)" : "Transition output"}</th>
          </tr>
        </thead>
        <tbody>
          {machine.transitions.length ? (
            machine.transitions.map((edge, i) => (
              <tr key={edge.id} className={cursor - 1 === i ? "current-row" : ""}>
                <td>{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <code>{edge.from}</code>
                </td>
                <td>{edge.input}</td>
                <td>
                  <code>{edge.to}</code>
                </td>
                <td className="output-cell">
                  {machine.type === "Moore"
                    ? machine.states.find((s) => s.id === edge.to)?.output
                    : edge.output}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="empty-table">
                Select products to generate your transaction’s transitions.
              </td>
            </tr>
          )}
          {!!machine.transitions.length && (
            <tr>
              <td>↺</td>
              <td>
                <code>{machine.states[machine.states.length - 1].id}</code>
              </td>
              <td>Reset</td>
              <td>
                <code>{machine.initial}</code>
              </td>
              <td>{machine.type === "Mealy" ? "Clear transaction" : "All buttons off"}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

type LogEntry = { time: string; message: string; detail: string; type: string };
const timestamp = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export default function App() {
  const [queue, setQueue] = useState<Code[]>([]);
  const [cursor, setCursor] = useState(0);
  const [machineType, setMachineType] = useState<MachineType>("Mealy");
  const [tab, setTab] = useState<MachineType | "Comparison">("Mealy");
  const [direction, setDirection] = useState("Mealy → Moore");
  const [max, setMax] = useState(6);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [panel, setPanel] = useState("Transition Table");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedState, setSelectedState] = useState<State | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [notice, setNotice] = useState("");
  const [help, setHelp] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [backendMealy, setBackendMealy] = useState<Automaton | null>(null);
  const [backendMoore, setBackendMoore] = useState<Automaton | null>(null);
  const [backendConvertedMealy, setBackendConvertedMealy] = useState<Automaton | null>(null);
  const [conversionDetails, setConversionDetails] = useState<ConversionResult | null>(null);

  const localMealy = useMemo(() => mealyMachine(queue), [queue]);
  const localMoore = useMemo(() => toMoore(localMealy), [localMealy]);
  const localConvertedMealy = useMemo(() => toMealy(localMoore), [localMoore]);

  const mealy = backendMealy || localMealy;
  const moore = backendMoore || localMoore;
  const convertedMealy = backendConvertedMealy || localConvertedMealy;

  const snap = snapshot(queue, cursor);
  const activeMachine = machineType === "Mealy" ? mealy : moore;
  const viewedMachine = tab === "Moore" ? moore : tab === "Mealy" ? mealy : activeMachine;
  const stateId = activeMachine.transitions[cursor - 1]?.to ?? activeMachine.initial;
  const stateName = activeMachine.states.find((s) => s.id === stateId)?.name ?? "IDLE";
  const total = queue.reduce((sum, code) => sum + product(code).price, 0);
  const progress = snap.events.length ? Math.round((cursor / snap.events.length) * 100) : 0;
  const locked = snap.stage !== "Selection" || playing;
  const removeLocked = snap.stage === "Dispensing" || snap.stage === "Complete" || playing;
  const equivalent = JSON.stringify(outputTrace(mealy)) === JSON.stringify(outputTrace(moore));
  const lastOutput = snap.last?.output ?? (machineType === "Moore" ? "All buttons off" : "—");

  const log = (message: string, detail: string, type = "event") =>
    setLogs((old) => [...old, { time: timestamp(), message, detail, type }]);
  const warn = (text: string) => {
    setNotice(text);
    log("Input rejected", text, "error");
  };

  // Poll backend health status
  useEffect(() => {
    let active = true;
    const check = async () => {
      const res = await checkBackendHealth();
      if (active) setBackendConnected(res.connected);
    };
    check();
    const interval = setInterval(check, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch full automata and conversion from backend whenever queue updates
  useEffect(() => {
    let active = true;
    apiGenerateFSM(queue, cursor)
      .then((res) => {
        if (!active) return;
        if (res.mealy) setBackendMealy(res.mealy);
        if (res.moore) setBackendMoore(res.moore);
        if (res.convertedMealy) setBackendConvertedMealy(res.convertedMealy);
        if (res.conversionDetails) setConversionDetails(res.conversionDetails);
      })
      .catch((err) => console.warn("Backend automata sync warning:", err));
    return () => {
      active = false;
    };
  }, [queue]);

  // Request backend conversion whenever conversion direction changes
  useEffect(() => {
    if (direction.startsWith("Mealy")) {
      apiConvertMealyToMoore(mealy)
        .then((res) => setConversionDetails(res))
        .catch((err) => console.warn("Mealy to Moore backend error:", err));
    } else {
      apiConvertMooreToMealy(moore)
        .then((res) => setConversionDetails(res))
        .catch((err) => console.warn("Moore to Mealy backend error:", err));
    }
  }, [direction, queue]);

  function execute(index: number) {
    const event = snap.events[index];
    if (!event) {
      setPlaying(false);
      return;
    }
    setCursor(index + 1);
    const target = activeMachine.transitions[index]?.to;
    log(event.input, `${target} · ${event.output}`, event.kind);
    if (index + 1 === snap.events.length) setPlaying(false);
  }
  useEffect(() => {
    if (!playing) return;
    if (cursor >= snap.events.length) {
      setPlaying(false);
      return;
    }
    const duration = snap.last?.kind === "release" ? 1800 : snap.last?.kind === "open" ? 1000 : 850;
    const timer = window.setTimeout(() => execute(cursor), duration / speed);
    return () => window.clearTimeout(timer);
  }, [playing, cursor, queue, speed, machineType]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    document.title = "Vendra — Mealy & Moore FSM Lab";
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  async function add(code: Code) {
    if (locked) {
      warn("Reset or step back to the selection phase to change products.");
      return;
    }
    if (queue.length >= max) {
      warn(`This transaction is limited to ${max} items. Adjust the limit in settings.`);
      return;
    }
    if (queue.filter((c) => c === code).length >= 8) {
      warn(`${code} has only 8 units available.`);
      return;
    }

    try {
      const res = await apiSelectProduct(code, queue, max);
      if (res.success && res.queue) {
        setQueue(res.queue);
        setCursor(res.queue.length);
        setSelectedState(null);
        if (res.mealy) setBackendMealy(res.mealy);
        if (res.moore) setBackendMoore(res.moore);
        if (res.convertedMealy) setBackendConvertedMealy(res.convertedMealy);
        if (res.conversionDetails) setConversionDetails(res.conversionDetails);
        log(
          `Select ${code}`,
          `Button ${code} illuminated · added to position ${res.queue.length}`,
          "select",
        );
        return;
      }
    } catch (err: any) {
      console.warn("Backend select fallback:", err);
    }

    // Client fallback if offline
    const next = [...queue, code];
    setQueue(next);
    setCursor(next.length);
    setSelectedState(null);
    log(
      `Select ${code}`,
      `Button ${code} illuminated · added to position ${next.length}`,
      "select",
    );
  }

  async function remove(index: number) {
    if (removeLocked) return;
    const next = queue.filter((_, i) => i !== index);
    log(`Remove ${queue[index]}`, `Selection updated · ${next.length} items remain`);
    setQueue(next);
    setCursor(next.length);
    setSelectedState(null);

    try {
      const res = await apiGenerateFSM(next, next.length);
      if (res.mealy) setBackendMealy(res.mealy);
      if (res.moore) setBackendMoore(res.moore);
      if (res.convertedMealy) setBackendConvertedMealy(res.convertedMealy);
      if (res.conversionDetails) setConversionDetails(res.conversionDetails);
    } catch (err) {
      console.warn("Sync after remove fallback:", err);
    }
  }

  async function reset(clear = true) {
    setPlaying(false);
    setCursor(0);
    setSelectedState(null);
    setNotice("");
    setAutoPlay(false);
    if (clear) setQueue([]);

    try {
      await apiResetTransaction(clear, clear ? [] : queue);
    } catch (err) {
      console.warn("Backend reset notice:", err);
    }

    log(
      "Reset simulation",
      clear
        ? "Transaction cleared · all buttons off · IDLE"
        : "Transaction rewound · ready to replay",
      "reset",
    );
  }

  async function confirmOrder() {
    if (!queue.length || snap.stage !== "Selection" || playing || cursor !== queue.length) return;
    try {
      const res = await apiConfirmTransaction(queue, cursor);
      if (res.success) {
        execute(cursor);
        return;
      }
    } catch (err: any) {
      warn(err.message || "Confirmation failed.");
    }
    execute(cursor);
  }

  async function startDispense() {
    if (snap.stage !== "Ready" || playing) return;
    try {
      const res = await apiDispenseStep(queue, cursor);
      if (res.success) {
        execute(cursor);
        setPlaying(true);
        return;
      }
    } catch (err: any) {
      warn(err.message || "Failed to start dispensing.");
    }
    execute(cursor);
    setPlaying(true);
  }

  function start() {
    if (!queue.length) {
      warn("Select at least one product to start the simulation.");
      return;
    }
    setCursor(0);
    setPlaying(autoPlay);
    setSelectedState(null);
    log("Simulation started", `${machineType} · replaying ${queue.length} product selections`);
    if (!autoPlay) execute(0);
  }
  function step() {
    if (!queue.length) {
      warn("Select products first. Each step then executes one transition.");
      return;
    }
    setPlaying(false);
    if (cursor < snap.events.length) execute(cursor);
  }
  function togglePlay() {
    if (!queue.length) {
      warn("Select at least one product before playback.");
      return;
    }
    if (cursor === snap.events.length) setCursor(0);
    setPlaying((old) => !old);
  }
  const showState = (state: State) => {
    setSelectedState(state);
    setPanel("State Information");
    setPanelOpen(true);
  };
  const changeType = (type: MachineType) => {
    setMachineType(type);
    setTab(type);
    setSelectedState(null);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Vendra home">
          <span className="brand-icon">
            <Icon name="machine" size={23} />
          </span>
          <span>
            vendra<span className="brand-period">.</span>
          </span>
          <span className="brand-lab">FSM LAB</span>
        </a>
        <div className="breadcrumb">
          Workspace <Icon name="chevron" size={12} />
          <span>Vending machine simulator</span>
        </div>
        <div className="topbar-right">
          <span
            className="system-status"
            title={
              backendConnected
                ? "Automata backend connected (http://localhost:5000)"
                : "Backend offline (running in offline fallback mode)"
            }
          >
            <i style={{ background: backendConnected ? "#7dff9a" : "#ecb456" }} />
            {backendConnected ? "Backend online" : "Local mode"}
          </span>
          <span className="top-separator" />
          <button className="icon-button" title="Simulator guide" onClick={() => setHelp(true)}>
            <Icon name="help" size={19} />
          </button>
          <button className="avatar" title="About this lab" onClick={() => setHelp(true)}>
            FL
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-title">
          <Icon name="grid" size={17} />
          <span>Transaction builder</span>
          <span className="subtle-tag">01</span>
        </div>
        <section className="product-section">
          <div className="section-heading">
            <h2>Choose your products</h2>
            <span className="count-badge">6 products</span>
          </div>
          <p className="sidebar-description">Build a sequence. Watch the logic.</p>
          <div className="product-list">
            {PRODUCTS.map((p) => {
              const count = queue.filter((code) => code === p.code).length;
              const released = snap.executed.filter(
                (e) => e.kind === "release" && e.code === p.code,
              ).length;
              return (
                <div className={`product-row ${count ? "chosen" : ""}`} key={p.code}>
                  <ProductArt code={p.code} />
                  <div className="product-description">
                    <span className="product-code">{p.code}</span>
                    <h3>{p.name}</h3>
                    <p>
                      {money(p.price)} <span>· {8 - released} left</span>
                    </p>
                  </div>
                  <div className="quantity-control">
                    <button
                      disabled={!count || removeLocked}
                      aria-label={`Remove one ${p.code}`}
                      onClick={() => remove(queue.lastIndexOf(p.code))}
                    >
                      <Icon name="minus" size={12} />
                    </button>
                    <span>{count}</span>
                    <button
                      disabled={locked || queue.length >= max || count >= 8}
                      aria-label={`Add ${p.code}`}
                      onClick={() => add(p.code)}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="selection-total">
            <span>
              Selected{" "}
              <strong>
                {queue.length} <small>items</small>
              </strong>
            </span>
            <span>
              Total <strong className="mint">{money(total)}</strong>
            </span>
          </div>
          <button className="clear-selection" onClick={() => reset()} disabled={!queue.length}>
            <Icon name="close" size={13} /> Clear selection
          </button>
        </section>

        <section className="settings-section">
          <div className="section-heading">
            <h2>
              <Icon name="settings" size={15} /> Simulation settings
            </h2>
          </div>
          <label className="setting-label">Machine type</label>
          <div className="segmented">
            {(["Mealy", "Moore"] as const).map((type) => (
              <button
                key={type}
                className={machineType === type ? "selected" : ""}
                onClick={() => changeType(type)}
              >
                {type === machineType && <Icon name="check" size={12} />} {type}
              </button>
            ))}
          </div>
          <label className="setting-label" htmlFor="conversion">
            Conversion mode
          </label>
          <div className="select-wrap">
            <Icon name="swap" size={14} />
            <select
              id="conversion"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                setTab("Comparison");
              }}
            >
              <option>Mealy → Moore</option>
              <option>Moore → Mealy</option>
            </select>
            <Icon name="down" size={12} />
          </div>
          <div className="settings-two">
            <label>
              Max. items
              <select
                aria-label="Maximum items"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              >
                {[3, 6, 9, 12].map((n) => (
                  <option key={n} disabled={n < queue.length} value={n}>
                    {n} items
                  </option>
                ))}
              </select>
            </label>
            <label>
              Animation speed
              <select
                aria-label="Animation speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value=".5">0.5× · Slow</option>
                <option value="1">1× · Normal</option>
                <option value="2">2× · Fast</option>
              </select>
            </label>
          </div>
          <button className="sidebar-reset" onClick={() => reset()}>
            <Icon name="reset" size={14} />
            Reset simulation
          </button>
        </section>

        <section className="queue-section">
          <div className="section-heading">
            <h2>Dispensing queue</h2>
            <span className="count-badge">{queue.length}</span>
          </div>
          <p className="sidebar-description">First selected, first dispensed.</p>
          {queue.length ? (
            <div className="queue-list">
              {queue.map((code, i) => (
                <div
                  className={`queue-item ${i < snap.released ? "dispensed" : ""}`}
                  key={`${code}-${i}`}
                >
                  <span className="queue-number">
                    {i < snap.released ? (
                      <Icon name="check" size={11} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <ProductArt code={code} small />
                  <span>
                    <b>{code}</b> {product(code).name}
                  </span>
                  <button
                    aria-label={`Remove selection ${i + 1}`}
                    disabled={removeLocked}
                    onClick={() => remove(i)}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="queue-empty">
              <Icon name="list" size={21} />
              <span>Your sequence starts here</span>
              <small>Add a product above or press a machine button.</small>
            </div>
          )}
        </section>
        <div className="sidebar-foot">
          <span className="tiny-dot" />
          <span>One transaction. Two perspectives.</span>
        </div>
      </aside>

      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow">AUTOMATA IN ACTION</div>
            <h1>
              Smart Vending Machine <span className="beta-badge">INTERACTIVE LAB</span>
            </h1>
            <p>Explore states, follow transitions, and see the theory come to life.</p>
          </div>
          <button className="guide-button" onClick={() => setHelp(true)}>
            <Icon name="book" size={16} />
            Quick guide
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="workspace-label">
          <span>
            <i className="tiny-dot" /> LIVE SIMULATION
          </span>
          <span className="workspace-hint">
            <Icon name="info" size={13} /> Select products to generate your automata
          </span>
        </div>
        <div className={`simulation-grid ${expanded ? "diagram-expanded" : ""}`}>
          <section className="card machine-card">
            <div className="card-heading">
              <div className="card-title">
                <span className="card-title-icon">
                  <Icon name="machine" size={17} />
                </span>
                <h2>Vending machine</h2>
              </div>
              <span className={`live-badge ${playing ? "running" : ""}`}>
                <i />
                {playing ? "Running" : snap.stage === "Complete" ? "Complete" : "Live preview"}
              </span>
            </div>
            <div className="machine-topline">
              <span>
                VM–006 <span>/</span> SMART SERIES
              </span>
              <span>
                <i className="tiny-dot" /> ONLINE
              </span>
            </div>
            <Machine
              selected={snap.selected}
              last={snap.last}
              stage={snap.stage}
              speed={speed}
              onSelect={add}
              invalid={!!notice}
            />
            <div className="transaction-progress">
              {["Selection", "Ready", "Dispensing", "Complete"].map((stage, i) => {
                const current = ["Selection", "Ready", "Dispensing", "Complete"].indexOf(
                  snap.stage,
                );
                return (
                  <div
                    className={`progress-stage ${i === current ? "active" : i < current ? "done" : ""}`}
                    key={stage}
                  >
                    <span className="stage-number">
                      {i < current ? <Icon name="check" size={10} /> : i + 1}
                    </span>
                    <span>{stage}</span>
                    {i < 3 && <Icon name="chevron" size={11} />}
                  </div>
                );
              })}
            </div>
            <div className="machine-actions">
              <div>
                <span className={`status-dot ${snap.stage === "Complete" ? "mint-bg" : ""}`} />
                <p>
                  {snap.stage === "Selection"
                    ? queue.length
                      ? `${queue.length} selections registered`
                      : "Waiting for your selection"
                    : snap.stage === "Ready"
                      ? "Selection confirmed. Ready to vend."
                      : snap.stage === "Complete"
                        ? "Transaction complete. Enjoy!"
                        : `Dispensing ${snap.released} of ${queue.length} items`}
                  <small>
                    {snap.stage === "Selection"
                      ? "Select products, then confirm your order."
                      : snap.stage === "Ready"
                        ? "Press DISPENSE to release your products."
                        : snap.stage === "Complete"
                          ? "Reset the simulation to start a new transaction."
                          : "Each release is a synchronized state event."}
                  </small>
                </p>
              </div>
              <button
                className="confirm-button"
                disabled={
                  !queue.length || snap.stage !== "Selection" || playing || cursor !== queue.length
                }
                onClick={confirmOrder}
              >
                <Icon name="check" size={14} />
                Confirm
              </button>
              <button
                className="dispense-button"
                disabled={snap.stage !== "Ready" || playing}
                onClick={startDispense}
              >
                <Icon name="bolt" size={14} />
                Dispense
              </button>
            </div>
          </section>

          <section className="card automata-card">
            <div className="card-heading">
              <div className="card-title">
                <span className="card-title-icon">
                  <Icon name="grid" size={16} />
                </span>
                <h2>Automata workspace</h2>
              </div>
              <button
                className="icon-button"
                title={expanded ? "Restore workspace" : "Expand automata workspace"}
                onClick={() => setExpanded(!expanded)}
              >
                <Icon name="expand" size={16} />
              </button>
            </div>
            <div className="automata-tabs" role="tablist">
              {(["Mealy", "Moore", "Comparison"] as const).map((name) => (
                <button
                  role="tab"
                  aria-selected={tab === name}
                  key={name}
                  onClick={() => {
                    setTab(name);
                    setSelectedState(null);
                  }}
                  className={tab === name ? "active" : ""}
                >
                  {name === "Comparison" ? (
                    <>
                      <Icon name="swap" size={13} />
                      Conversion
                    </>
                  ) : (
                    `${name} Machine`
                  )}
                </button>
              ))}
            </div>
            {tab !== "Comparison" ? (
              <>
                <div className="diagram-description">
                  <div>
                    <h3>
                      {tab === "Mealy" ? "Outputs on transitions" : "Outputs belong to states"}
                    </h3>
                    <p>
                      {tab === "Mealy"
                        ? "Input + current state → output"
                        : "Current state → output · inputs on arrows"}
                    </p>
                  </div>
                  <span className="diagram-count">
                    {viewedMachine.states.length} states <span>·</span>{" "}
                    {viewedMachine.transitions.length} transitions
                  </span>
                </div>
                <Diagram
                  machine={viewedMachine}
                  cursor={cursor}
                  onState={showState}
                  invalid={!!notice}
                />
                <div className="diagram-insight">
                  <Icon name="info" size={15} />
                  <p>
                    {tab === "Mealy" ? (
                      <>
                        Read each arrow as <code>input / output</code>. Outputs fire when a
                        transition is taken.
                      </>
                    ) : (
                      <>
                        Read outputs below each state. Split states preserve the Mealy output
                        sequence.
                      </>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <div className="comparison-overview">
                <div className="conversion-heading">
                  <span className="conversion-icon">
                    <Icon name="swap" size={20} />
                  </span>
                  <div>
                    <h3>{direction}</h3>
                    <p>Same transaction. Equivalent behavior.</p>
                  </div>
                  <span className="equivalent-badge">
                    <Icon name="check" size={12} />
                    Equivalent
                  </span>
                </div>
                <div className="conversion-stats">
                  <div>
                    <span>Original states</span>
                    <strong>
                      {direction.startsWith("Mealy") ? mealy.states.length : moore.states.length}
                    </strong>
                    <small>
                      {direction.startsWith("Mealy") ? "Mealy machine" : "Moore machine"}
                    </small>
                  </div>
                  <Icon name="arrow" size={20} />
                  <div>
                    <span>Converted states</span>
                    <strong className="mint">
                      {direction.startsWith("Mealy")
                        ? moore.states.length
                        : convertedMealy.states.length}
                    </strong>
                    <small>
                      {direction.startsWith("Mealy")
                        ? "Moore machine"
                        : "Mealy (before minimization)"}
                    </small>
                  </div>
                </div>
                <div className="mini-comparison">
                  <div>
                    <span className="mini-label">
                      ORIGINAL {direction.startsWith("Mealy") ? "MEALY" : "MOORE"}
                    </span>
                    <Diagram
                      machine={direction.startsWith("Mealy") ? mealy : moore}
                      cursor={cursor}
                      onState={showState}
                      compact
                    />
                  </div>
                  <div>
                    <span className="mini-label">
                      CONVERTED {direction.startsWith("Mealy") ? "MOORE" : "MEALY"}
                    </span>
                    <Diagram
                      machine={direction.startsWith("Mealy") ? moore : convertedMealy}
                      cursor={cursor}
                      onState={showState}
                      compact
                    />
                  </div>
                </div>
                <div className="diagram-insight">
                  <Icon name="info" size={15} />
                  <p>
                    {direction.startsWith("Mealy")
                      ? "Different incoming outputs require separate Moore states. Mint dots mark output-specific states."
                      : "Move each destination state’s output onto its incoming transitions. State minimization is a separate step."}
                  </p>
                </div>
              </div>
            )}
            <div className="automata-foot">
              <span>
                <Icon name="bolt" size={13} /> Generated from your transaction
              </span>
              <span>
                <i className="tiny-dot" />
                {equivalent ? "Behavior verified" : "Trace mismatch"}
              </span>
            </div>
          </section>
        </div>

        <section className="card controls-card">
          <div className="control-buttons">
            <button className="primary-button" onClick={start} disabled={playing}>
              <Icon name="play" size={15} />
              Start simulation
            </button>
            <div className="transport-controls">
              <button
                title="Step backward"
                aria-label="Step backward"
                disabled={!cursor}
                onClick={() => {
                  setPlaying(false);
                  setCursor(Math.max(0, cursor - 1));
                  log(
                    "Step backward",
                    "Visual state restored to the previous transition",
                    "rewind",
                  );
                }}
              >
                <Icon name="prev" size={17} />
              </button>
              <button
                className={playing ? "transport-active" : ""}
                title={playing ? "Pause" : "Play"}
                aria-label={playing ? "Pause" : "Play"}
                onClick={togglePlay}
              >
                <Icon name={playing ? "pause" : "play"} size={17} />
              </button>
              <button
                title="Step forward"
                aria-label="Step forward"
                disabled={!!queue.length && cursor === snap.events.length}
                onClick={step}
              >
                <Icon name="next" size={17} />
              </button>
            </div>
            <span className="control-divider" />
            <button className="reset-control" onClick={() => reset()}>
              <Icon name="reset" size={15} />
              <span>Reset</span>
            </button>
            <label className="auto-play">
              <input
                type="checkbox"
                checked={autoPlay}
                onChange={(e) => {
                  setAutoPlay(e.target.checked);
                  if (e.target.checked && queue.length) {
                    if (cursor === snap.events.length) setCursor(0);
                    setPlaying(true);
                  } else if (!e.target.checked) setPlaying(false);
                }}
              />
              <span className="switch" />
              <span>Auto play</span>
            </label>
            <div className="speed-chip">
              <Icon name="clock" size={13} />
              {speed}×
            </div>
          </div>
          <div className="runtime-metrics">
            <div>
              <span>Current state</span>
              <strong className="mint">
                <i className="tiny-dot" />
                {stateId} <span>— {stateName}</span>
              </strong>
            </div>
            <div>
              <span>Current input</span>
              <strong>{snap.last?.input ?? "Awaiting input"}</strong>
            </div>
            <div>
              <span>Current output</span>
              <strong>{lastOutput}</strong>
            </div>
            <div>
              <span>Transition</span>
              <strong className="mono">
                {String(cursor).padStart(2, "0")}{" "}
                <span>/ {String(snap.events.length).padStart(2, "0")}</span>
              </strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong className="mono">
                {snap.remaining} <span>/ {queue.length} items</span>
              </strong>
            </div>
            <div className="runtime-progress">
              <span>
                Progress <b>{progress}%</b>
              </span>
              <div className="progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        </section>

        <section className="card information-card">
          <div className="information-tabs">
            {[
              { name: "Transition Table", icon: "list" },
              { name: "State Information", icon: "info" },
              { name: "Simulation Log", icon: "code" },
              { name: "Conversion Explanation", icon: "swap" },
            ].map((item) => (
              <button
                key={item.name}
                className={panel === item.name ? "active" : ""}
                onClick={() => {
                  if (panel === item.name) setPanelOpen(!panelOpen);
                  else {
                    setPanel(item.name);
                    setPanelOpen(true);
                  }
                }}
              >
                <Icon name={item.icon} size={15} />
                {item.name}
                {item.name === "Simulation Log" && !!logs.length && (
                  <span className="log-count">{logs.length}</span>
                )}
              </button>
            ))}
            <button
              className="collapse-panel"
              title={panelOpen ? "Collapse panel" : "Expand panel"}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <Icon
                name="down"
                size={15}
                style={{ transform: panelOpen ? "rotate(180deg)" : "" }}
              />
            </button>
          </div>
          {panelOpen && (
            <div className="information-body">
              {panel === "Transition Table" && (
                <>
                  <div className="table-heading">
                    <span>
                      <b>{viewedMachine.type} transition table</b>
                      <small>Ordered inputs for the current transaction</small>
                    </span>
                    <span className="subtle-tag">{snap.events.length} transitions</span>
                  </div>
                  <TransitionTable machine={viewedMachine} cursor={cursor} />
                </>
              )}
              {panel === "Simulation Log" && (
                <div className="simulation-log">
                  <div className="table-heading">
                    <b>
                      Event stream <span className="mint">/ live</span>
                    </b>
                    <button className="text-button" onClick={() => setLogs([])}>
                      Clear log
                    </button>
                  </div>
                  {logs.length ? (
                    logs.map((entry, i) => (
                      <div className={`log-entry ${entry.type}`} key={i}>
                        <time>{entry.time}</time>
                        <span className="log-bullet" />
                        <b>{entry.message}</b>
                        <span>{entry.detail}</span>
                      </div>
                    ))
                  ) : (
                    <div className="information-empty">
                      <Icon name="code" size={25} />
                      <p>Every input has a story.</p>
                      <span>Select a product to start the event stream.</span>
                    </div>
                  )}
                </div>
              )}
              {panel === "State Information" &&
                (() => {
                  const state =
                    selectedState && viewedMachine.states.some((s) => s.id === selectedState.id)
                      ? selectedState
                      : viewedMachine.states.find(
                          (s) =>
                            s.id ===
                            (viewedMachine.transitions[cursor - 1]?.to ?? viewedMachine.initial),
                        )!;
                  const outgoing = viewedMachine.transitions.filter(
                    (edge) => edge.from === state.id,
                  );
                  return (
                    <div className="state-detail">
                      <div className="state-detail-badge">{state.id}</div>
                      <div>
                        <h3>{state.name}</h3>
                        <p>{state.purpose}</p>
                        <div className="state-detail-grid">
                          <div>
                            <span>Associated outputs</span>
                            <b>
                              {state.output ??
                                ([...new Set(outgoing.map((e) => e.output))].join(" · ") ||
                                  "On Reset: clear transaction")}
                            </b>
                          </div>
                          <div>
                            <span>Available inputs</span>
                            <b>
                              {[...new Set(outgoing.map((e) => e.input))].join(" · ") ||
                                (state.name === "COMPLETE"
                                  ? "Reset"
                                  : "Select a product to generate inputs")}
                            </b>
                          </div>
                        </div>
                        <div className="outgoing-list">
                          {outgoing.map((edge) => (
                            <code key={edge.id}>
                              {edge.from} → {edge.to}{" "}
                              <span>
                                {edge.input}
                                {viewedMachine.type === "Mealy" ? ` / ${edge.output}` : ""}
                              </span>
                            </code>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              {panel === "Conversion Explanation" && (
                <div className="conversion-explanation">
                  <div className="explanation-intro">
                    <span className="conversion-icon">
                      <Icon name="swap" size={20} />
                    </span>
                    <div>
                      <h3>Different structure. Same observable behavior.</h3>
                      <p>
                        Conversion uses the exact ordered transaction, including repeated products.
                      </p>
                    </div>
                    <span className="equivalent-badge">
                      <Icon name="check" size={12} />
                      Output traces match
                    </span>
                  </div>
                  <div className="explanation-steps">
                    {(conversionDetails?.explanation && conversionDetails.explanation.length > 0
                      ? conversionDetails.explanation.slice(0, 4).map((text, i) => [
                          `Step ${i + 1}`,
                          text,
                        ])
                      : direction.startsWith("Mealy")
                        ? [
                            [
                              "Inspect incoming outputs",
                              "Group transitions by their destination state and emitted output.",
                            ],
                            [
                              "Split output-specific states",
                              "Create one Moore state per unique (destination, output) pair. Reuse equal pairs.",
                            ],
                            [
                              "Move outputs onto states",
                              "Arrow labels keep inputs only; entering a state produces its associated output.",
                            ],
                          ]
                        : [
                            [
                              "Inspect state outputs",
                              "Read the output associated with every Moore destination state.",
                            ],
                            [
                              "Move outputs to transitions",
                              "Copy the destination output onto each incoming edge; retain the state structure.",
                            ],
                            [
                              "Compare ordered traces",
                              "Exclude the initial Moore output and compare each input’s resulting output.",
                            ],
                          ]
                    ).map(([title, description], i) => (
                      <div key={title}>
                        <span>{i + 1}</span>
                        <h4>{title}</h4>
                        <p>{description}</p>
                      </div>
                    ))}
                  </div>

                  {conversionDetails?.addedStates && conversionDetails.addedStates.length > 0 && (
                    <div style={{ marginTop: "18px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                      <div className="table-heading">
                        <span>
                          <b>Split Moore states</b>
                          <small>States introduced to associate unique outputs directly with states</small>
                        </span>
                        <span className="subtle-tag">{conversionDetails.addedStates.length} split states</span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>New state</th>
                              <th>Name</th>
                              <th>State output</th>
                              <th>Split from</th>
                              <th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {conversionDetails.addedStates.map((st) => (
                              <tr key={st.id}>
                                <td><code>{st.id}</code></td>
                                <td><b>{st.name}</b></td>
                                <td className="output-cell">{st.output}</td>
                                <td><code>{st.originalState}</code></td>
                                <td><small>{st.reason}</small></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  <p className="timing-note">
                    <Icon name="info" size={15} />
                    The Moore machine emits “All buttons off” at initialization. After each input,
                    its destination-state output matches the Mealy transition output. No extra
                    physical release or dummy input is introduced. Both diagrams are guarded by the
                    transaction’s input order.
                  </p>
                  <div className="output-comparison">
                    <h4>
                      Observable output trace <span className="equivalent-badge">Equivalent</span>
                    </h4>
                    <p>
                      {outputTrace(mealy).join(" → ") ||
                        "Choose products to compare output traces."}
                    </p>
                  </div>
                  <div className="comparison-tables">
                    <div>
                      <h4>Original {direction.startsWith("Mealy") ? "Mealy" : "Moore"}</h4>
                      <TransitionTable machine={direction.startsWith("Mealy") ? mealy : moore} />
                    </div>
                    <div>
                      <h4>Converted {direction.startsWith("Mealy") ? "Moore" : "Mealy"}</h4>
                      <TransitionTable
                        machine={direction.startsWith("Mealy") ? moore : convertedMealy}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <footer className="workspace-footer">
          <span>
            <Icon name="code" size={13} /> Built to make finite state machines feel tangible.
          </span>
          <span>
            MEALY & MOORE <i /> ONE SHARED TRANSACTION
          </span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="alert">
          <Icon name="info" size={18} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice("")}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="guide-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              title="Close guide"
              onClick={() => setHelp(false)}
            >
              <Icon name="close" />
            </button>
            <div className="eyebrow">A LITTLE INPUT. A LOT OF INSIGHT.</div>
            <h2 id="guide-title">Your finite state machine lab.</h2>
            <p>One vending machine. Two ways to describe its behavior.</p>
            <ol>
              <li>
                <b>Build a transaction.</b> Press A1–B3 on the machine or add products in the
                sidebar. Your input order becomes the dispensing order.
              </li>
              <li>
                <b>Confirm, then dispense.</b> Selection never releases a product. Confirm your
                queue, then press Dispense for sequential delivery.
              </li>
              <li>
                <b>Explore each transition.</b> Step forward or backward, or replay with Auto play.
                Start simulation rewinds your queue for replay.
              </li>
              <li>
                <b>Compare both machines.</b> The Mealy machine emits on edges; the Moore machine
                emits on state entry. Click a state to inspect it.
              </li>
            </ol>
            <div className="timing-note">
              <Icon name="info" size={17} />
              This is a frontend learning simulator. Inventory and transaction history are
              session-only; no payments are processed.
            </div>
            <button className="primary-button" onClick={() => setHelp(false)}>
              Let’s experiment
              <Icon name="arrow" size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
