import {
  type Automaton,
  type Code,
  type SimulationResult,
  type SimulationStep,
  type State,
  type Transition,
} from "./types.js";

/**
 * Builds the ordered transaction transitions for a sequence of selected products.
 * Guarantees distinct ordered events even for repeated product selections.
 */
export function buildTransactionTransitions(queue: Code[]): Transition[] {
  if (!queue.length) return [];

  const rawTransitions: Omit<Transition, "id" | "order">[] = [];

  // Phase 1: Selection transitions
  queue.forEach((code, i) => {
    rawTransitions.push({
      from: i === 0 ? "S0" : "S1",
      to: "S1",
      input: `Select ${code}`,
      output: `Light ${code}`,
      kind: "select",
      code,
    });
  });

  // Phase 2: Confirmation
  rawTransitions.push({
    from: "S1",
    to: "S2",
    input: "Confirm",
    output: "Confirm selection",
    kind: "confirm",
  });

  // Phase 3: Dispenser activation
  rawTransitions.push({
    from: "S2",
    to: "S3",
    input: "Dispense",
    output: "Open dispenser",
    kind: "open",
  });

  // Phase 4: Sequential product releases
  queue.forEach((code) => {
    rawTransitions.push({
      from: "S3",
      to: "S3",
      input: `Dispense ${code}`,
      output: `Release ${code}`,
      kind: "release",
      code,
    });
  });

  // Phase 5: Transaction completion
  rawTransitions.push({
    from: "S3",
    to: "S4",
    input: "Last item dispensed",
    output: "Close dispenser",
    kind: "complete",
  });

  return rawTransitions.map((t, index) => ({
    ...t,
    id: `e${index}`,
    order: index,
  }));
}

/**
 * Generates the formal Mealy machine for a transaction.
 * In a Mealy machine, outputs are associated directly with state transitions:
 * λ : S × Σ → Λ
 */
export function generateMealyMachine(queue: Code[]): Automaton {
  const states: State[] = [
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
  ];

  return {
    type: "Mealy",
    initial: "S0",
    states,
    transitions: buildTransactionTransitions(queue),
  };
}

/**
 * Returns the observable output trace for the machine's sequence of transitions.
 */
export function getMealyOutputTrace(machine: Automaton): string[] {
  return machine.transitions.map((t) => t.output);
}

/**
 * Simulates a sequence of inputs on a Mealy machine.
 */
export function simulateMealy(
  machine: Automaton,
  inputs: string[],
  initialState?: string
): SimulationResult {
  let currentState = initialState || machine.initial;
  const trace: SimulationStep[] = [];
  const visitedStates = [currentState];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    // Find matching transition from current state
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

    currentState = transition.to;
    visitedStates.push(currentState);
    trace.push({
      step: i + 1,
      from: transition.from,
      input: transition.input,
      to: transition.to,
      output: transition.output,
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
