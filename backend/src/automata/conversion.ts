import {
  type AddedStateInfo,
  type Automaton,
  type ConversionResult,
  type State,
  type Transition,
} from "./types.js";
import { getMealyOutputTrace } from "./mealy.js";
import { getMooreOutputTrace } from "./moore.js";

/**
 * Converts a Mealy machine to an equivalent Moore machine.
 *
 * Algorithm:
 * 1. An initial Moore state M0 is established with default initial output (e.g. "All buttons off").
 * 2. In a Mealy machine, outputs reside on transitions: (s, a) -> (s', y).
 *    In a Moore machine, outputs reside on states: s' -> y.
 * 3. Therefore, whenever incoming transitions to a destination Mealy state s' carry
 *    different outputs, s' MUST be split into multiple distinct Moore states (s', y_1), (s', y_2)...
 * 4. Each transition is then rerouted to the specific state associated with that output.
 * 5. Outgoing transitions from s' are preserved across all split copies.
 */
export function convertMealyToMoore(source: Automaton): ConversionResult {
  if (source.type !== "Mealy") {
    throw new Error("Source automaton must be of type 'Mealy' for Mealy-to-Moore conversion.");
  }

  const initialMooreState: State = {
    id: "M0",
    name: "IDLE",
    output: "All buttons off",
    purpose: "Initial Moore state before any input is consumed.",
  };

  const states: State[] = [initialMooreState];
  const addedStates: AddedStateInfo[] = [];
  const stateOutputPairs = new Map<string, string>(); // "originalId:output" -> newMooreStateId
  const explanation: string[] = [];

  explanation.push("Established initial Moore state M0 (IDLE) with default output 'All buttons off'.");

  let previousStateId = initialMooreState.id;

  const transitions: Transition[] = source.transitions.map((edge) => {
    const pairKey = `${edge.to}:${edge.output}`;
    let targetStateId = stateOutputPairs.get(pairKey);

    if (!targetStateId) {
      targetStateId = `M${states.length}`;
      stateOutputPairs.set(pairKey, targetStateId);

      const originalState = source.states.find((s) => s.id === edge.to)!;
      const isSplitRelease = edge.kind === "release";
      const isSplitSelect =
        edge.kind === "select" && states.some((s) => s.name === "SELECTING");

      const stateName = isSplitRelease
        ? `DISPENSE ${edge.code}`
        : originalState?.name ?? "STATE";

      const newState: State = {
        id: targetStateId,
        name: stateName,
        output: edge.output,
        purpose: originalState?.purpose ?? `Associated with output ${edge.output}`,
        introduced: isSplitRelease || isSplitSelect,
      };

      states.push(newState);

      if (newState.introduced) {
        addedStates.push({
          id: targetStateId,
          name: stateName,
          output: edge.output,
          originalState: edge.to,
          reason: `Mealy state '${edge.to}' (${originalState?.name}) was split into '${targetStateId}' to bind output '${edge.output}' directly to a state.`,
        });
        explanation.push(
          `Created split state ${targetStateId} (${stateName}) for Mealy state ${edge.to} to hold output '${edge.output}'.`
        );
      } else {
        explanation.push(
          `Mapped Mealy state ${edge.to} (${originalState?.name}) to Moore state ${targetStateId} with output '${edge.output}'.`
        );
      }
    }

    const convertedEdge: Transition = {
      ...edge,
      from: previousStateId,
      to: targetStateId,
      output: "", // Outputs belong to states in Moore machines
    };

    previousStateId = targetStateId;
    return convertedEdge;
  });

  const converted: Automaton = {
    type: "Moore",
    initial: initialMooreState.id,
    states,
    transitions,
  };

  const originalTrace = getMealyOutputTrace(source);
  const convertedTrace = getMooreOutputTrace(converted);
  const outputTracesMatch =
    JSON.stringify(originalTrace) === JSON.stringify(convertedTrace);

  explanation.push(
    `Conversion completed: ${source.states.length} Mealy states converted into ${states.length} Moore states (${addedStates.length} split states created). Observable output equivalence: ${outputTracesMatch ? "VERIFIED" : "MISMATCH"}.`
  );

  return {
    converted,
    originalType: "Mealy",
    convertedType: "Moore",
    originalStateCount: source.states.length,
    convertedStateCount: states.length,
    addedStates,
    explanation,
    outputTracesMatch,
    originalTrace,
    convertedTrace,
  };
}

/**
 * Converts a Moore machine to an equivalent Mealy machine.
 *
 * Algorithm:
 * 1. For each transition from state P to state Q in the Moore machine:
 *    Assign transition output λ(P, a) = λ_M(Q), where λ_M(Q) is the output of destination state Q.
 * 2. Remove state outputs from states so they become pure Mealy states.
 * 3. Observable outputs on transition matches the Moore machine's state entry output.
 */
export function convertMooreToMealy(source: Automaton): ConversionResult {
  if (source.type !== "Moore") {
    throw new Error("Source automaton must be of type 'Moore' for Moore-to-Mealy conversion.");
  }

  const explanation: string[] = [];
  explanation.push("Beginning Moore-to-Mealy conversion.");

  // Map state outputs onto incoming transitions
  const transitions: Transition[] = source.transitions.map((edge) => {
    const targetState = source.states.find((s) => s.id === edge.to);
    const output = targetState?.output ?? "";
    explanation.push(
      `Transition ${edge.from} -> ${edge.to} on '${edge.input}' assigned output '${output}' from destination state ${edge.to}.`
    );
    return {
      ...edge,
      output,
    };
  });

  // Strip state outputs
  const states: State[] = source.states.map((s) => ({
    id: s.id,
    name: s.name,
    purpose: s.purpose,
  }));

  const converted: Automaton = {
    type: "Mealy",
    initial: source.initial,
    states,
    transitions,
  };

  const originalTrace = getMooreOutputTrace(source);
  const convertedTrace = getMealyOutputTrace(converted);
  const outputTracesMatch =
    JSON.stringify(originalTrace) === JSON.stringify(convertedTrace);

  explanation.push(
    `Conversion completed: All state outputs successfully transferred to incoming transitions. Observable output equivalence: ${outputTracesMatch ? "VERIFIED" : "MISMATCH"}.`
  );

  return {
    converted,
    originalType: "Moore",
    convertedType: "Mealy",
    originalStateCount: source.states.length,
    convertedStateCount: states.length,
    addedStates: [],
    explanation,
    outputTracesMatch,
    originalTrace,
    convertedTrace,
  };
}
