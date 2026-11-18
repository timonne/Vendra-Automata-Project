import {
  type Automaton,
  type Code,
  type SimulationResult,
  type SimulationStep,
  type State,
  type Transition,
} from "./types.js";

/**
 * Returns the observable output trace for a Moore machine following its transitions.
 * (In Moore machines, the output is emitted upon entering the destination state).
 */
export function getMooreOutputTrace(machine: Automaton): string[] {
  return machine.transitions.map((edge) => {
    const targetState = machine.states.find((s) => s.id === edge.to);
    return targetState?.output ?? "";
  });
}

/**
 * Generates an original canonical Moore machine directly for the given transaction queue.
 * In Moore machines, every output is associated directly with a state:
 * λ_M : S → Λ
 */
export function generateOriginalMooreMachine(queue: Code[]): Automaton {
  const initial: State = {
    id: "M0",
    name: "IDLE",
    output: "All buttons off",
    purpose: "Initial idle state with all button indicator lights turned off.",
  };

  const states: State[] = [initial];
  const transitions: Transition[] = [];

  if (!queue.length) {
    return {
      type: "Moore",
      initial: initial.id,
      states,
      transitions,
    };
  }

  let previousStateId = initial.id;
  let order = 0;

  // Phase 1: Selection states (each selection state outputs "Light {code}")
  const selectStatesMap = new Map<string, string>();
  for (const code of queue) {
    const key = `SELECT:${code}`;
    let stateId = selectStatesMap.get(key);
    if (!stateId) {
      stateId = `M${states.length}`;
      selectStatesMap.set(key, stateId);
      states.push({
        id: stateId,
        name: "SELECTING",
        output: `Light ${code}`,
        purpose: `Product ${code} selected and illuminated.`,
        introduced: states.some((s) => s.name === "SELECTING"),
      });
    }

    transitions.push({
      id: `e${order}`,
      from: previousStateId,
      to: stateId,
      input: `Select ${code}`,
      output: "",
      kind: "select",
      code,
      order: order++,
    });
    previousStateId = stateId;
  }

  // Phase 2: Ready state
  const readyStateId = `M${states.length}`;
  states.push({
    id: readyStateId,
    name: "READY",
    output: "Confirm selection",
    purpose: "Selection confirmed. Dispenser is locked and ready.",
  });
  transitions.push({
    id: `e${order}`,
    from: previousStateId,
    to: readyStateId,
    input: "Confirm",
    output: "",
    kind: "confirm",
    order: order++,
  });
  previousStateId = readyStateId;

  // Phase 3: Dispense Open state
  const openStateId = `M${states.length}`;
  states.push({
    id: openStateId,
    name: "DISPENSING",
    output: "Open dispenser",
    purpose: "Dispenser compartment flap opened for release.",
  });
  transitions.push({
    id: `e${order}`,
    from: previousStateId,
    to: openStateId,
    input: "Dispense",
    output: "",
    kind: "open",
    order: order++,
  });
  previousStateId = openStateId;

  // Phase 4: Release states (one Moore state per unique released product)
  const releaseStatesMap = new Map<string, string>();
  for (const code of queue) {
    const key = `RELEASE:${code}`;
    let stateId = releaseStatesMap.get(key);
    if (!stateId) {
      stateId = `M${states.length}`;
      releaseStatesMap.set(key, stateId);
      states.push({
        id: stateId,
        name: `DISPENSE ${code}`,
        output: `Release ${code}`,
        purpose: `Dispense item ${code} into collection tray.`,
        introduced: true,
      });
    }

    transitions.push({
      id: `e${order}`,
      from: previousStateId,
      to: stateId,
      input: `Dispense ${code}`,
      output: "",
      kind: "release",
      code,
      order: order++,
    });
    previousStateId = stateId;
  }

  // Phase 5: Complete state
  const completeStateId = `M${states.length}`;
  states.push({
    id: completeStateId,
    name: "COMPLETE",
    output: "Close dispenser",
    purpose: "All items released and flap closed. Complete.",
  });
  transitions.push({
    id: `e${order}`,
    from: previousStateId,
    to: completeStateId,
    input: "Last item dispensed",
    output: "",
    kind: "complete",
    order: order++,
  });

  return {
    type: "Moore",
    initial: initial.id,
    states,
    transitions,
  };
}

/**
 * Simulates a sequence of inputs on a Moore machine.
 */
export function simulateMoore(
  machine: Automaton,
  inputs: string[],
  initialState?: string
): SimulationResult {
  let currentState = initialState || machine.initial;
  const trace: SimulationStep[] = [];
  const visitedStates = [currentState];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const transition = machine.transitions.find(
      (t) => t.from === currentState && t.input.toLowerCase() === input.toLowerCase()
    );

    if (!transition) {
      return {
        success: false,
        trace,
        finalState: currentState,
        visitedStates,
        totalSteps: i,
        error: `No transition defined from state '${currentState}' on input '${input}'.`,
      };
    }

    const nextStateObj = machine.states.find((s) => s.id === transition.to);
    const output = nextStateObj?.output ?? "";

    currentState = transition.to;
    visitedStates.push(currentState);
    trace.push({
      step: i + 1,
      from: transition.from,
      input: transition.input,
      to: transition.to,
      output,
      stateOutput: output,
    });
  }

  return {
    success: true,
    trace,
    finalState: currentState,
    visitedStates,
    totalSteps: inputs.length,
  };
}
