import assert from "node:assert/strict";
import { test, describe } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("Health Check API", () => {
  test("GET /api/health returns 200 OK with server stats", async () => {
    const res = await request(app).get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.equal(res.body.service, "vendra-fsm-backend");
    assert.ok(typeof res.body.uptime === "number");
    assert.ok(typeof res.body.timestamp === "string");
  });
});

describe("Vending Machine Endpoints", () => {
  test("POST /api/vending/generate generates Mealy, Moore and conversion data", async () => {
    const res = await request(app)
      .post("/api/vending/generate")
      .send({ queue: ["A1", "B2"] });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.mealy.type, "Mealy");
    assert.equal(res.body.moore.type, "Moore");
    assert.equal(res.body.convertedMealy.type, "Mealy");
    assert.equal(res.body.total, 3.75); // 1.50 + 2.25
    assert.equal(res.body.snapshot.stage, "Selection");
    assert.ok(res.body.conversionDetails.outputTracesMatch);
  });

  test("POST /api/vending/select adds valid product", async () => {
    const res = await request(app)
      .post("/api/vending/select")
      .send({ code: "A1", currentQueue: [] });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.queue, ["A1"]);
    assert.equal(res.body.snapshot.stage, "Selection");
  });

  test("POST /api/vending/select rejects invalid product", async () => {
    const res = await request(app)
      .post("/api/vending/select")
      .send({ code: "Z9", currentQueue: [] });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("Invalid product code"));
  });

  test("POST /api/vending/confirm advances to Ready stage", async () => {
    const res = await request(app)
      .post("/api/vending/confirm")
      .send({ queue: ["A1", "A2"], cursor: 2 });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.stage, "Ready");
    assert.equal(res.body.snapshot.stage, "Ready");
  });

  test("POST /api/vending/confirm rejects empty queue", async () => {
    const res = await request(app)
      .post("/api/vending/confirm")
      .send({ queue: [] });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("Cannot confirm an empty transaction"));
  });

  test("POST /api/vending/dispense advances dispensing step", async () => {
    // Queue length 1, confirm is at cursor 2 (0: select A1, 1: confirm, 2: open dispenser)
    const res = await request(app)
      .post("/api/vending/dispense")
      .send({ queue: ["A1"], cursor: 2 });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.cursor, 3);
    assert.equal(res.body.stage, "Dispensing");
  });

  test("POST /api/vending/dispense rejects dispensing before confirmation", async () => {
    const res = await request(app)
      .post("/api/vending/dispense")
      .send({ queue: ["A1"], cursor: 1 }); // cursor 1 is still in Selection stage

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("Selection must be confirmed"));
  });

  test("POST /api/vending/reset resets state", async () => {
    const res = await request(app)
      .post("/api/vending/reset")
      .send({ clear: true });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.queue, []);
    assert.equal(res.body.cursor, 0);
    assert.equal(res.body.stage, "Selection");
  });
});

describe("Automata Simulation & Conversion Endpoints", () => {
  test("POST /api/automata/simulate runs input trace", async () => {
    const genRes = await request(app)
      .post("/api/vending/generate")
      .send({ queue: ["A1"] });

    const simRes = await request(app)
      .post("/api/automata/simulate")
      .send({
        machine: genRes.body.mealy,
        inputs: ["Select A1", "Confirm", "Dispense", "Dispense A1", "Last item dispensed"],
      });

    assert.equal(simRes.status, 200);
    assert.equal(simRes.body.success, true);
    assert.equal(simRes.body.totalSteps, 5);
    assert.equal(simRes.body.finalState, "S4");
  });

  test("POST /api/automata/convert/mealy-to-moore converts correctly", async () => {
    const genRes = await request(app)
      .post("/api/vending/generate")
      .send({ queue: ["A1", "B2"] });

    const res = await request(app)
      .post("/api/automata/convert/mealy-to-moore")
      .send({ machine: genRes.body.mealy });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.convertedType, "Moore");
    assert.ok(res.body.outputTracesMatch);
    assert.ok(res.body.addedStates.length > 0);
  });

  test("POST /api/automata/convert/moore-to-mealy converts correctly", async () => {
    const genRes = await request(app)
      .post("/api/vending/generate")
      .send({ queue: ["A1", "B2"] });

    const res = await request(app)
      .post("/api/automata/convert/moore-to-mealy")
      .send({ machine: genRes.body.moore });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.convertedType, "Mealy");
    assert.ok(res.body.outputTracesMatch);
  });

  test("POST /api/automata/validate validates automaton", async () => {
    const genRes = await request(app)
      .post("/api/vending/generate")
      .send({ queue: ["A1"] });

    const res = await request(app)
      .post("/api/automata/validate")
      .send({ machine: genRes.body.mealy });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.valid, true);
    assert.equal(res.body.stats.stateCount, 5);
  });
});
