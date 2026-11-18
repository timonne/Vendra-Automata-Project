import { type Automaton, type ValidationResult, type ValidationStats } from "./types.js";

/**
 * Validates an automaton according to formal automata theory rules.
 */
export function validateAutomaton(machine: Automaton): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Basic structural checks
  if (!machine) {
    return {
      valid: false,
      errors: ["Automaton definition is missing or null."],
      warnings: [],
      stats: {
        stateCount: 0,
        transitionCount: 0,
        isDeterministic: false,
        reachableStates: [],
        unreachableStates: [],
        terminalStates: [],
      },
    };
  }

  if (machine.type !== "Mealy" && machine.type !== "Moore") {
    errors.push(`Invalid machine type '${machine.type}'. Expected 'Mealy' or 'Moore'.`);
  }

  if (!machine.states || !Array.isArray(machine.states) || machine.states.length === 0) {
    errors.push("Automaton must contain at least one state.");
  }

  const stateIds = new Set<string>();
  const duplicateStateIds = new Set<string>();

  for (const s of machine.states || []) {
    if (!s.id) {
      errors.push("Encountered state with missing ID.");
    } else if (stateIds.has(s.id)) {
      duplicateStateIds.add(s.id);
    } else {
      stateIds.add(s.id);
    }

    if (machine.type === "Moore" && (s.output === undefined || s.output === null)) {
      warnings.push(`Moore state '${s.id}' (${s.name}) has no defined state output.`);
    }
  }

  if (duplicateStateIds.size > 0) {
    errors.push(`Duplicate state IDs detected: ${Array.from(duplicateStateIds).join(", ")}`);
  }

  if (!machine.initial) {
    errors.push("Automaton must designate an initial state.");
  } else if (!stateIds.has(machine.initial)) {
    errors.push(`Initial state '${machine.initial}' is not present in the states set.`);
  }

  // 2. Transition checks
  const transitions = machine.transitions || [];
  let isDeterministic = true;
  const stateInputPairs = new Set<string>();

  transitions.forEach((t, index) => {
    if (!t.from || !stateIds.has(t.from)) {
      errors.push(`Transition #${index} has invalid or nonexistent source state '${t.from}'.`);
    }
    if (!t.to || !stateIds.has(t.to)) {
      errors.push(`Transition #${index} has invalid or nonexistent target state '${t.to}'.`);
    }
    if (!t.input || t.input.trim() === "") {
      errors.push(`Transition #${index} (${t.from} -> ${t.to}) has an empty input symbol.`);
    }

    if (machine.type === "Mealy" && (t.output === undefined || t.output === null)) {
      warnings.push(`Mealy transition #${index} (${t.from} -> ${t.to}) has no output specified.`);
    }

    // Check determinism: (from, input) must be unique
    const key = `${t.from}:::${t.input.trim().toLowerCase()}`;
    if (stateInputPairs.has(key)) {
      isDeterministic = false;
      warnings.push(
        `Nondeterministic branch: State '${t.from}' has multiple transitions for input '${t.input}'.`
      );
    } else {
      stateInputPairs.add(key);
    }
  });

  // 3. Reachability analysis (BFS from initial state)
  const reachable = new Set<string>();
  if (machine.initial && stateIds.has(machine.initial)) {
    const queue: string[] = [machine.initial];
    reachable.add(machine.initial);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const outgoing = transitions.filter((t) => t.from === current);
      for (const edge of outgoing) {
        if (!reachable.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  }

  const unreachableStates = Array.from(stateIds).filter((id) => !reachable.has(id));
  if (unreachableStates.length > 0) {
    warnings.push(`Unreachable states detected: ${unreachableStates.join(", ")}`);
  }

  // 4. Terminal states (states with no outgoing transitions)
  const statesWithOutgoing = new Set(transitions.map((t) => t.from));
  const terminalStates = Array.from(stateIds).filter((id) => !statesWithOutgoing.has(id));

  const stats: ValidationStats = {
    stateCount: stateIds.size,
    transitionCount: transitions.length,
    isDeterministic,
    reachableStates: Array.from(reachable),
    unreachableStates,
    terminalStates,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}
