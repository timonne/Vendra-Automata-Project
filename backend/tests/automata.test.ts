import assert from "node:assert/strict";
import { test, describe } from "node:test";
import { PRODUCTS, type Code } from "../src/automata/types.js";
import {
  generateMealyMachine,
  getMealyOutputTrace,
  simulateMealy,
  buildTransactionTransitions,
} from "../src/automata/mealy.js";
import {
  generateOriginalMooreMachine,
  getMooreOutputTrace,
  simulateMoore,
} from "../src/automata/moore.js";
import {
  convertMealyToMoore,
  convertMooreToMealy,
} from "../src/automata/conversion.js";
import {
  computeSnapshot,
  validateProductSelection,
  validateConfirmation,
  validateDispenseStep,
  calculateTotal,
} from "../src/automata/vending.js";
import { validateAutomaton } from "../src/automata/validator.js";

describe("Mealy Machine Generation", () => {
  test("generates valid Mealy machine for empty queue", () => {
    const machine = generateMealyMachine([]);
    assert.equal(machine.type, "Mealy");
    assert.equal(machine.initial, "S0");
    assert.equal(machine.states.length, 5);
    assert.equal(machine.transitions.length, 0);
  });

  test("generates valid Mealy machine for single product", () => {
    const machine = generateMealyMachine(["A1"]);
    assert.equal(machine.type, "Mealy");
    assert.equal(machine.states.length, 5);
    // select A1, confirm, open, release A1, complete => 5 transitions
    assert.equal(machine.transitions.length, 5);
    assert.equal(machine.transitions[0].input, "Select A1");
    assert.equal(machine.transitions[0].output, "Light A1");
    assert.equal(machine.transitions[3].input, "Dispense A1");
    assert.equal(machine.transitions[3].output, "Release A1");
  });

  test("generates valid transitions for multiple products", () => {
    const queue: Code[] = ["A1", "B2", "A3"];
    const transitions = buildTransactionTransitions(queue);
    // 3 selects + 1 confirm + 1 open + 3 releases + 1 complete = 9
    assert.equal(transitions.length, 9);
    assert.deepEqual(
      transitions.map((t) => t.kind),
      ["select", "select", "select", "confirm", "open", "release", "release", "release", "complete"]
    );
  });
});

describe("Moore Machine Generation", () => {
  test("generates original Moore machine for empty queue", () => {
    const machine = generateOriginalMooreMachine([]);
    assert.equal(machine.type, "Moore");
    assert.equal(machine.states[0].output, "All buttons off");
    assert.equal(machine.transitions.length, 0);
  });

  test("generates original Moore machine with outputs on states", () => {
    const machine = generateOriginalMooreMachine(["A2", "B1"]);
    assert.equal(machine.type, "Moore");
    assert.ok(machine.states.length > 0);
    // Every state in a Moore machine must have an output
    assert.ok(machine.states.every((s) => typeof s.output === "string"));
    // Transitions in Moore machine have blank output
    assert.ok(machine.transitions.every((t) => t.output === ""));
  });
});

describe("Mealy-to-Moore & Moore-to-Mealy Conversions", () => {
  test("Mealy to Moore conversion splits states correctly when outputs differ", () => {
    const queue: Code[] = ["A1", "B2"];
    const mealy = generateMealyMachine(queue);
    const result = convertMealyToMoore(mealy);

    assert.equal(result.convertedType, "Moore");
    assert.ok(result.outputTracesMatch);
    assert.ok(result.convertedStateCount > result.originalStateCount);
    // S3 (dispensing) gets split into Release A1 and Release B2 states
    assert.ok(result.addedStates.length >= 2);
    assert.ok(result.addedStates.some((s) => s.output === "Release A1"));
    assert.ok(result.addedStates.some((s) => s.output === "Release B2"));
  });

  test("round-trip conversion preserves output equivalence", () => {
    const queue: Code[] = ["A1", "A2", "B3"];
    const mealy = generateMealyMachine(queue);
    const mooreResult = convertMealyToMoore(mealy);
    const mealyRoundtripResult = convertMooreToMealy(mooreResult.converted);

    const originalTrace = getMealyOutputTrace(mealy);
    const mooreTrace = getMooreOutputTrace(mooreResult.converted);
    const roundtripTrace = getMealyOutputTrace(mealyRoundtripResult.converted);

    assert.deepEqual(originalTrace, mooreTrace);
    assert.deepEqual(mooreTrace, roundtripTrace);
  });

  test("conversion preserves output trace for all six products selected", () => {
    const allSix: Code[] = ["A1", "A2", "A3", "B1", "B2", "B3"];
    const mealy = generateMealyMachine(allSix);
    const mooreResult = convertMealyToMoore(mealy);

    assert.equal(mooreResult.outputTracesMatch, true);
    assert.deepEqual(getMealyOutputTrace(mealy), getMooreOutputTrace(mooreResult.converted));
  });

  test("conversion handles different product selection orders and duplicates", () => {
    const queue1: Code[] = ["B3", "A1", "B3", "A2"];
    const queue2: Code[] = ["A2", "B3", "A1", "B3"];

    const res1 = convertMealyToMoore(generateMealyMachine(queue1));
    const res2 = convertMealyToMoore(generateMealyMachine(queue2));

    assert.equal(res1.outputTracesMatch, true);
    assert.equal(res2.outputTracesMatch, true);
    // Both queues contain duplicate B3; identical outputs are reused
    assert.equal(res1.converted.states.filter((s) => s.output === "Release B3").length, 1);
  });
});

describe("Simulation of Input Sequences", () => {
  test("simulates valid inputs on Mealy machine", () => {
    const mealy = generateMealyMachine(["A1"]);
    const inputs = ["Select A1", "Confirm", "Dispense", "Dispense A1", "Last item dispensed"];
    const sim = simulateMealy(mealy, inputs);

    assert.equal(sim.success, true);
    assert.equal(sim.totalSteps, 5);
    assert.equal(sim.finalState, "S4");
    assert.deepEqual(
      sim.trace.map((s) => s.output),
      ["Light A1", "Confirm selection", "Open dispenser", "Release A1", "Close dispenser"]
    );
  });

  test("simulates valid inputs on Moore machine", () => {
    const mealy = generateMealyMachine(["A1"]);
    const moore = convertMealyToMoore(mealy).converted;
    const inputs = ["Select A1", "Confirm", "Dispense", "Dispense A1", "Last item dispensed"];
    const sim = simulateMoore(moore, inputs);

    assert.equal(sim.success, true);
    assert.equal(sim.totalSteps, 5);
    assert.deepEqual(
      sim.trace.map((s) => s.output),
      ["Light A1", "Confirm selection", "Open dispenser", "Release A1", "Close dispenser"]
    );
  });

  test("fails simulation on invalid input symbol", () => {
    const mealy = generateMealyMachine(["A1"]);
    const inputs = ["Select B2"]; // Invalid initial input for queue containing only A1
    const sim = simulateMealy(mealy, inputs);

    assert.equal(sim.success, false);
    assert.ok(sim.error?.includes("No transition defined"));
  });
});

describe("Vending Machine Transaction Rules & Invariants", () => {
  test("selection validation rejects invalid product code", () => {
    const res = validateProductSelection("C9", []);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("Invalid product code"));
  });

  test("selection validation enforces maximum limit", () => {
    const currentQueue: Code[] = ["A1", "A2", "A3"];
    const res = validateProductSelection("B1", currentQueue, 3);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("Transaction capacity reached"));
  });

  test("selection validation enforces maximum units per item", () => {
    const currentQueue: Code[] = Array(8).fill("A1");
    const res = validateProductSelection("A1", currentQueue, 12);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("Stock limit reached"));
  });

  test("rejects confirmation on empty transaction", () => {
    const res = validateConfirmation([], "Selection");
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("Cannot confirm an empty transaction"));
  });

  test("rejects dispensing before confirmation", () => {
    const queue: Code[] = ["A1"];
    // cursor at selection phase (cursor = 1)
    const res = validateDispenseStep(queue, 1);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("Selection must be confirmed"));
  });

  test("rejects dispensing after completion", () => {
    const queue: Code[] = ["A1"];
    const events = buildTransactionTransitions(queue);
    // cursor at end of transaction
    const res = validateDispenseStep(queue, events.length);
    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("already been dispensed"));
  });

  test("calculates accurate monetary totals", () => {
    assert.equal(calculateTotal([]), 0);
    // A1 = 1.5, B1 = 2.5, A2 = 2.0 -> total = 6.0
    assert.equal(calculateTotal(["A1", "B1", "A2"]), 6.0);
  });

  test("resetting during a transaction restores IDLE and clears queue", () => {
    const queue: Code[] = ["A1", "B2"];
    const snapMid = computeSnapshot(queue, 2);
    assert.equal(snapMid.executed.length, 2);

    const snapReset = computeSnapshot([], 0);
    assert.equal(snapReset.stage, "Selection");
    assert.equal(snapReset.executed.length, 0);
    assert.equal(snapReset.selected.length, 0);
  });
});

describe("Automata Validation Suite", () => {
  test("validates a well-formed Mealy machine", () => {
    const mealy = generateMealyMachine(["A1", "B1"]);
    const res = validateAutomaton(mealy);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.stats.stateCount, 5);
  });

  test("detects invalid initial state", () => {
    const mealy = generateMealyMachine(["A1"]);
    mealy.initial = "INVALID_STATE";
    const res = validateAutomaton(mealy);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("Initial state")));
  });

  test("detects transitions with non-existent states", () => {
    const mealy = generateMealyMachine(["A1"]);
    mealy.transitions.push({
      id: "bad1",
      from: "S99",
      to: "S1",
      input: "test",
      output: "test",
      kind: "select",
      order: 99,
    });
    const res = validateAutomaton(mealy);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes("invalid or nonexistent source state")));
  });
});
