import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRODUCTS,
  transaction,
  mealyMachine,
  toMoore,
  toMealy,
  outputTrace,
  snapshot,
  type Code,
} from "./fsm.ts";

test("selection, confirmation, opening, release and closing are separate ordered events", () => {
  const queue: Code[] = ["A1", "A2", "B3"];
  const events = transaction(queue);
  assert.deepEqual(
    events.map((e) => e.kind),
    ["select", "select", "select", "confirm", "open", "release", "release", "release", "complete"],
  );
  assert.deepEqual(
    events.filter((e) => e.kind === "release").map((e) => e.code),
    queue,
  );
  assert.equal(snapshot(queue, 3).stage, "Selection");
  assert.equal(snapshot(queue, 3).released, 0);
  assert.equal(snapshot(queue, 4).stage, "Ready");
  assert.equal(snapshot(queue, 4).released, 0);
  assert.equal(snapshot(queue, 5).stage, "Dispensing");
  assert.equal(snapshot(queue, 6).released, 1);
  assert.equal(snapshot(queue, events.length).stage, "Complete");
  assert.equal(snapshot(queue, events.length).remaining, 0);
});

test("single-product graphs do not include unrelated product states", () => {
  const machine = toMoore(mealyMachine(["B2"]));
  assert.equal(machine.states.length, 6);
  assert.equal(machine.states.filter((s) => s.output?.startsWith("Release")).length, 1);
  assert.ok(machine.states.some((s) => s.output === "Release B2"));
  assert.ok(!JSON.stringify(machine).includes("A1"));
});

test("repeated items retain their order and reuse equal output states", () => {
  const queue: Code[] = ["B3", "A1", "B3", "A2"];
  const source = mealyMachine(queue);
  const converted = toMoore(source);
  assert.deepEqual(
    converted.transitions.map((e) => e.input),
    source.transitions.map((e) => e.input),
  );
  assert.deepEqual(outputTrace(converted), outputTrace(source));
  assert.equal(converted.states.filter((s) => s.output === "Release B3").length, 1);
  assert.equal(converted.transitions.filter((e) => e.input === "Dispense B3").length, 2);
});

test("rewinding restores every visual snapshot without changing the transaction", () => {
  const queue: Code[] = ["A1", "B2"];
  const end = transaction(queue).length;
  for (let cursor = end; cursor >= 0; cursor--) {
    const state = snapshot(queue, cursor);
    assert.equal(state.executed.length, cursor);
    assert.equal(state.released + state.remaining, queue.length);
    if (cursor <= queue.length + 2) assert.equal(state.released, 0);
  }
  assert.equal(snapshot(queue, 0).selected.length, 0);
  assert.deepEqual(queue, ["A1", "B2"]);
});

test("conversions preserve output traces for every ordered queue of up to four items", () => {
  let count = 0;
  const check = (queue: Code[]) => {
    const mealy = mealyMachine(queue);
    const moore = toMoore(mealy);
    const roundtrip = toMealy(moore);
    assert.deepEqual(outputTrace(mealy), outputTrace(moore));
    assert.deepEqual(outputTrace(roundtrip), outputTrace(mealy));
    assert.equal(moore.states[0].output, "All buttons off");
    assert.ok(moore.transitions.every((e) => e.output === ""));
    assert.equal(new Set(moore.states.map((s) => s.id)).size, moore.states.length);
    let previous = moore.initial;
    for (const edge of moore.transitions) {
      assert.equal(edge.from, previous);
      assert.ok(moore.states.some((s) => s.id === edge.to));
      previous = edge.to;
    }
    count++;
    if (queue.length < 4) PRODUCTS.forEach((p) => check([...queue, p.code]));
  };
  check([]);
  assert.equal(count, 1555);
});

test("six-product and maximum-size transactions remain equivalent", () => {
  for (const queue of [
    PRODUCTS.map((p) => p.code),
    Array.from({ length: 12 }, (_, i) => PRODUCTS[i % 6].code),
  ]) {
    assert.deepEqual(outputTrace(mealyMachine(queue)), outputTrace(toMoore(mealyMachine(queue))));
    assert.deepEqual(
      transaction(queue)
        .filter((e) => e.kind === "release")
        .map((e) => e.code),
      queue,
    );
  }
});
