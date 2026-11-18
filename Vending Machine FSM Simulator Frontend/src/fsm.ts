export const PRODUCTS = [
  { code: "A1", name: "Classic Cola", price: 1.5, color: "#ef645d", type: "bottle" },
  { code: "A2", name: "Sea Salt Chips", price: 2, color: "#68a5ef", type: "bag" },
  { code: "A3", name: "Sparkling Lime", price: 1.75, color: "#83c998", type: "can" },
  { code: "B1", name: "Berry Energy", price: 2.5, color: "#b38ada", type: "can" },
  { code: "B2", name: "Orange Juice", price: 2.25, color: "#ecb456", type: "bottle" },
  { code: "B3", name: "Mint Chocolate", price: 1.75, color: "#6ac9b8", type: "bar" },
] as const;
export type Code = (typeof PRODUCTS)[number]["code"];
export type Kind = "select" | "confirm" | "open" | "release" | "complete";
export type MachineType = "Mealy" | "Moore";
export interface Transition {
  id: string;
  from: string;
  to: string;
  input: string;
  output: string;
  kind: Kind;
  code?: Code;
  order: number;
}
export interface State {
  id: string;
  name: string;
  output?: string;
  purpose: string;
  introduced?: boolean;
}
export interface Automaton {
  type: MachineType;
  states: State[];
  transitions: Transition[];
  initial: string;
}
export const product = (code: Code) => PRODUCTS.find((p) => p.code === code)!;
export const money = (value: number) => `$${value.toFixed(2)}`;

// An ordered input word is the transaction's guard: event n is enabled only
// after event n-1. Repeated products remain distinct events, not a set.
export function transaction(queue: Code[]): Transition[] {
  if (!queue.length) return [];
  const events: Omit<Transition, "id" | "order">[] = queue.map((code, i) => ({
    from: i === 0 ? "S0" : "S1",
    to: "S1",
    input: `Select ${code}`,
    output: `Light ${code}`,
    kind: "select",
    code,
  }));
  events.push(
    { from: "S1", to: "S2", input: "Confirm", output: "Confirm selection", kind: "confirm" },
    { from: "S2", to: "S3", input: "Dispense", output: "Open dispenser", kind: "open" },
    ...queue.map((code): Omit<Transition, "id" | "order"> => ({
      from: "S3",
      to: "S3",
      input: `Dispense ${code}`,
      output: `Release ${code}`,
      kind: "release",
      code,
    })),
    {
      from: "S3",
      to: "S4",
      input: "Last item dispensed",
      output: "Close dispenser",
      kind: "complete",
    },
  );
  return events.map((event, order) => ({ ...event, order, id: `e${order}` }));
}
export function mealyMachine(queue: Code[]): Automaton {
  return {
    type: "Mealy",
    initial: "S0",
    states: [
      {
        id: "S0",
        name: "IDLE",
        purpose: "No products selected. Waiting for the first product input.",
      },
      {
        id: "S1",
        name: "SELECTING",
        purpose: "Register each product in order. No product is dispensed here.",
      },
      {
        id: "S2",
        name: "READY",
        purpose: "Selection confirmed. Waiting for the explicit Dispense input.",
      },
      {
        id: "S3",
        name: "DISPENSING",
        purpose: "Open the flap and release the queued products one at a time.",
      },
      {
        id: "S4",
        name: "COMPLETE",
        purpose: "All products released and the flap closed. Reset to start again.",
      },
    ],
    transitions: transaction(queue),
  };
}
// Output-splitting conversion over the guarded transaction path. Each distinct
// (destination, output) pair becomes a Moore state; equal pairs are reused.
export function toMoore(source: Automaton): Automaton {
  const initial: State = {
    id: "M0",
    name: "IDLE",
    output: "All buttons off",
    purpose: "Initial Moore output, before any input is consumed.",
  };
  const states = [initial];
  const pairs = new Map<string, string>();
  let previous = initial.id;
  const transitions = source.transitions.map((edge) => {
    const key = `${edge.to}:${edge.output}`;
    let target = pairs.get(key);
    if (!target) {
      target = `M${states.length}`;
      pairs.set(key, target);
      const original = source.states.find((state) => state.id === edge.to)!;
      states.push({
        id: target,
        name: edge.kind === "release" ? `DISPENSE ${edge.code}` : original.name,
        output: edge.output,
        purpose: original.purpose,
        introduced:
          edge.kind === "release" ||
          (edge.kind === "select" && states.some((s) => s.name === "SELECTING")),
      });
    }
    const converted = { ...edge, from: previous, to: target, output: "" };
    previous = target;
    return converted;
  });
  return { type: "Moore", states, transitions, initial: initial.id };
}
export function toMealy(source: Automaton): Automaton {
  return {
    type: "Mealy",
    initial: source.initial,
    states: source.states.map(({ output: _output, ...state }) => state),
    transitions: source.transitions.map((edge) => ({
      ...edge,
      output: source.states.find((state) => state.id === edge.to)?.output ?? "",
    })),
  };
}
export function outputTrace(machine: Automaton): string[] {
  return machine.transitions.map((edge) =>
    machine.type === "Mealy"
      ? edge.output
      : machine.states.find((state) => state.id === edge.to)!.output!,
  );
}
export function snapshot(queue: Code[], cursor: number) {
  const events = transaction(queue);
  const executed = events.slice(0, cursor);
  const last = executed.at(-1);
  const released = executed.filter((e) => e.kind === "release").length;
  const selected = executed.filter((e) => e.kind === "select").map((e) => e.code!);
  const stage = !last
    ? "Selection"
    : last.kind === "complete"
      ? "Complete"
      : last.kind === "open" || last.kind === "release"
        ? "Dispensing"
        : last.kind === "confirm"
          ? "Ready"
          : "Selection";
  return { events, executed, last, released, selected, stage, remaining: queue.length - released };
}
