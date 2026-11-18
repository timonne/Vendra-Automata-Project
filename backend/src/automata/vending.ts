import {
  type Code,
  type Snapshot,
  type Product,
  PRODUCTS,
  getProduct,
  isValidCode,
} from "./types.js";
import { buildTransactionTransitions } from "./mealy.js";

export const DEFAULT_MAX_ITEMS = 6;
export const MAX_ALLOWED_ITEMS = 12;
export const MAX_UNITS_PER_ITEM = 8;

/**
 * Computes the transaction snapshot given the product queue and the current execution cursor.
 */
export function computeSnapshot(queue: Code[], cursor: number): Snapshot {
  const events = buildTransactionTransitions(queue);
  const clampedCursor = Math.max(0, Math.min(cursor, events.length));
  const executed = events.slice(0, clampedCursor);
  const last = executed.length > 0 ? executed[executed.length - 1] : undefined;
  const released = executed.filter((e) => e.kind === "release").length;
  const selected = executed.filter((e) => e.kind === "select").map((e) => e.code!);

  let stage: "Selection" | "Ready" | "Dispensing" | "Complete";
  if (!last) {
    stage = "Selection";
  } else if (last.kind === "complete") {
    stage = "Complete";
  } else if (last.kind === "open" || last.kind === "release") {
    stage = "Dispensing";
  } else if (last.kind === "confirm") {
    stage = "Ready";
  } else {
    stage = "Selection";
  }

  return {
    events,
    executed,
    last,
    released,
    selected,
    stage,
    remaining: Math.max(0, queue.length - released),
  };
}

/**
 * Validates a product selection action.
 */
export function validateProductSelection(
  code: string,
  currentQueue: Code[],
  maxLimit: number = DEFAULT_MAX_ITEMS
): { valid: boolean; error?: string; code?: Code } {
  if (!isValidCode(code)) {
    return {
      valid: false,
      error: `Invalid product code '${code}'. Allowed codes: ${PRODUCTS.map((p) => p.code).join(", ")}.`,
    };
  }

  const effectiveMax = Math.min(Math.max(1, maxLimit), MAX_ALLOWED_ITEMS);

  if (currentQueue.length >= effectiveMax) {
    return {
      valid: false,
      error: `Transaction capacity reached. Maximum ${effectiveMax} items permitted per transaction.`,
    };
  }

  const countForCode = currentQueue.filter((c) => c === code).length;
  if (countForCode >= MAX_UNITS_PER_ITEM) {
    return {
      valid: false,
      error: `Stock limit reached: only ${MAX_UNITS_PER_ITEM} units of product ${code} available in machine.`,
    };
  }

  return {
    valid: true,
    code,
  };
}

/**
 * Validates transaction confirmation.
 */
export function validateConfirmation(
  queue: Code[],
  currentStage: string
): { valid: boolean; error?: string } {
  if (queue.length === 0) {
    return {
      valid: false,
      error: "Cannot confirm an empty transaction. Select at least one product.",
    };
  }

  if (currentStage !== "Selection") {
    return {
      valid: false,
      error: `Cannot confirm transaction when in stage '${currentStage}'. Must be in 'Selection' stage.`,
    };
  }

  return { valid: true };
}

/**
 * Validates dispensing step.
 */
export function validateDispenseStep(
  queue: Code[],
  cursor: number
): { valid: boolean; error?: string; nextCursor: number; isComplete: boolean } {
  const events = buildTransactionTransitions(queue);

  if (queue.length === 0) {
    return {
      valid: false,
      error: "No products in transaction to dispense.",
      nextCursor: cursor,
      isComplete: false,
    };
  }

  const snap = computeSnapshot(queue, cursor);

  if (snap.stage === "Selection") {
    return {
      valid: false,
      error: "Cannot dispense: Selection must be confirmed before dispensing can begin.",
      nextCursor: cursor,
      isComplete: false,
    };
  }

  if (snap.stage === "Complete" || cursor >= events.length) {
    return {
      valid: false,
      error: "All products have already been dispensed. Reset the machine to start a new transaction.",
      nextCursor: cursor,
      isComplete: true,
    };
  }

  const nextCursor = cursor + 1;
  const isComplete = nextCursor >= events.length;

  return {
    valid: true,
    nextCursor,
    isComplete,
  };
}

/**
 * Calculates total monetary cost of the transaction queue.
 */
export function calculateTotal(queue: Code[]): number {
  return queue.reduce((sum, code) => {
    const p = getProduct(code);
    return sum + (p ? p.price : 0);
  }, 0);
}
