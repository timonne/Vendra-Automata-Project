import { Router, type Request, type Response } from "express";
import { type Code } from "../automata/types.js";
import { generateMealyMachine } from "../automata/mealy.js";
import { convertMealyToMoore, convertMooreToMealy } from "../automata/conversion.js";
import {
  computeSnapshot,
  validateProductSelection,
  validateConfirmation,
  validateDispenseStep,
  calculateTotal,
  DEFAULT_MAX_ITEMS,
} from "../automata/vending.js";

export const vendingRouter = Router();

/**
 * POST /api/vending/generate
 * Generates the full suite of automata and snapshots for a transaction queue.
 */
vendingRouter.post("/generate", (req: Request, res: Response) => {
  try {
    const queue = (req.body.queue || []) as Code[];
    const cursor = typeof req.body.cursor === "number" ? req.body.cursor : queue.length;

    const mealy = generateMealyMachine(queue);
    const mooreConversion = convertMealyToMoore(mealy);
    const moore = mooreConversion.converted;
    const convertedMealy = convertMooreToMealy(moore).converted;
    const snapshot = computeSnapshot(queue, cursor);
    const total = calculateTotal(queue);

    res.json({
      success: true,
      queue,
      total,
      snapshot,
      mealy,
      moore,
      convertedMealy,
      conversionDetails: mooreConversion,
      summary: `Generated FSM for ${queue.length} product(s). Total: $${total.toFixed(2)}.`,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || "Failed to generate vending machine automata.",
    });
  }
});

/**
 * POST /api/vending/select
 * Registers a new product selection in the transaction queue.
 */
vendingRouter.post("/select", (req: Request, res: Response) => {
  try {
    const { code, currentQueue = [], maxItems = DEFAULT_MAX_ITEMS } = req.body;

    const validation = validateProductSelection(code, currentQueue as Code[], maxItems);
    if (!validation.valid || !validation.code) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    const nextQueue = [...(currentQueue as Code[]), validation.code];
    const mealy = generateMealyMachine(nextQueue);
    const mooreConversion = convertMealyToMoore(mealy);
    const moore = mooreConversion.converted;
    const convertedMealy = convertMooreToMealy(moore).converted;
    const snapshot = computeSnapshot(nextQueue, nextQueue.length);
    const total = calculateTotal(nextQueue);

    res.json({
      success: true,
      queue: nextQueue,
      total,
      snapshot,
      mealy,
      moore,
      convertedMealy,
      conversionDetails: mooreConversion,
      message: `Selected ${validation.code}. Button illuminated · queue size: ${nextQueue.length}.`,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to process product selection.",
    });
  }
});

/**
 * POST /api/vending/confirm
 * Confirms product selections, moving from Selection phase to Ready phase.
 */
vendingRouter.post("/confirm", (req: Request, res: Response) => {
  try {
    const queue = (req.body.queue || []) as Code[];
    const currentCursor = typeof req.body.cursor === "number" ? req.body.cursor : queue.length;
    const currentSnap = computeSnapshot(queue, currentCursor);

    const validation = validateConfirmation(queue, currentSnap.stage);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
      });
    }

    // Confirm is event at index queue.length
    const confirmCursor = queue.length + 1;
    const nextSnapshot = computeSnapshot(queue, confirmCursor);

    res.json({
      success: true,
      stage: "Ready",
      cursor: confirmCursor,
      snapshot: nextSnapshot,
      message: "Selection confirmed. Machine is in READY state.",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to confirm transaction.",
    });
  }
});

/**
 * POST /api/vending/dispense
 * Advances the dispensing process by one discrete event or step.
 */
vendingRouter.post("/dispense", (req: Request, res: Response) => {
  try {
    const queue = (req.body.queue || []) as Code[];
    const cursor = typeof req.body.cursor === "number" ? req.body.cursor : 0;

    const validation = validateDispenseStep(queue, cursor);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        cursor,
        isComplete: validation.isComplete,
      });
    }

    const nextSnapshot = computeSnapshot(queue, validation.nextCursor);
    const currentEvent = nextSnapshot.last;

    res.json({
      success: true,
      cursor: validation.nextCursor,
      snapshot: nextSnapshot,
      event: currentEvent,
      stage: nextSnapshot.stage,
      isComplete: validation.isComplete,
      message: currentEvent
        ? `${currentEvent.input} -> ${currentEvent.output}`
        : "Step executed.",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to process dispensing step.",
    });
  }
});

/**
 * POST /api/vending/reset
 * Resets the vending machine state and transaction queue.
 */
vendingRouter.post("/reset", (req: Request, res: Response) => {
  try {
    const clear = req.body.clear !== false;
    const queue: Code[] = clear ? [] : ((req.body.queue || []) as Code[]);
    const snapshot = computeSnapshot(queue, 0);
    const mealy = generateMealyMachine(queue);
    const moore = convertMealyToMoore(mealy).converted;

    res.json({
      success: true,
      queue,
      cursor: 0,
      stage: "Selection",
      snapshot,
      mealy,
      moore,
      message: clear
        ? "Transaction cleared · all buttons off · IDLE state restored."
        : "Simulation rewound · ready to replay.",
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to reset vending machine.",
    });
  }
});
