import {
  type Code,
  type Automaton,
  type State,
  type Transition,
  mealyMachine,
  toMoore,
  toMealy,
  snapshot,
  outputTrace,
} from "./fsm";

// Determine API base URL: from env var or default to /api (handled by Vite proxy or deployed server)
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/+$/, "");

export interface Snapshot {
  events: Transition[];
  executed: Transition[];
  last?: Transition;
  released: number;
  selected: Code[];
  stage: "Selection" | "Ready" | "Dispensing" | "Complete";
  remaining: number;
}

export interface AddedStateInfo {
  id: string;
  name: string;
  output: string;
  originalState: string;
  reason: string;
}

export interface ConversionResult {
  converted: Automaton;
  originalType: string;
  convertedType: string;
  originalStateCount: number;
  convertedStateCount: number;
  addedStates: AddedStateInfo[];
  explanation: string[];
  outputTracesMatch: boolean;
  originalTrace?: string[];
  convertedTrace?: string[];
}

export interface ValidationStats {
  stateCount: number;
  transitionCount: number;
  isDeterministic: boolean;
  reachableStates: string[];
  unreachableStates: string[];
  terminalStates: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: ValidationStats;
}

export interface SimulationStep {
  step: number;
  from: string;
  input: string;
  to: string;
  output: string;
  stateOutput?: string;
}

export interface SimulationResult {
  success: boolean;
  trace: SimulationStep[];
  finalState: string;
  visitedStates: string[];
  totalSteps: number;
  error?: string;
}

export interface GenerateResponse {
  success: boolean;
  queue: Code[];
  total: number;
  snapshot: Snapshot;
  mealy: Automaton;
  moore: Automaton;
  convertedMealy: Automaton;
  conversionDetails: ConversionResult;
  summary: string;
}

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error) errorMsg = errorData.error;
    } catch {
      // Ignore JSON parse failure on error body
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

/**
 * Checks backend health and connection.
 */
export async function checkBackendHealth(): Promise<{
  connected: boolean;
  service?: string;
  uptime?: number;
  error?: string;
}> {
  try {
    const data = await fetchJson<{ status: string; service: string; uptime: number }>("/health");
    return {
      connected: data.status === "ok",
      service: data.service,
      uptime: data.uptime,
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err.message || "Failed to reach backend.",
    };
  }
}

/**
 * Generates Mealy, Moore and converted machines along with transaction snapshot.
 */
export async function apiGenerateFSM(queue: Code[], cursor: number): Promise<GenerateResponse> {
  try {
    return await fetchJson<GenerateResponse>("/vending/generate", {
      method: "POST",
      body: JSON.stringify({ queue, cursor }),
    });
  } catch (err) {
    // Client-side fallback if backend is unreachable
    console.warn("Backend unavailable, using client-side automata generation fallback:", err);
    const mealy = mealyMachine(queue);
    const moore = toMoore(mealy);
    const convertedMealy = toMealy(moore);
    const snap = snapshot(queue, cursor);
    const total = queue.length * 1.5; // fallback
    return {
      success: true,
      queue,
      total,
      snapshot: snap,
      mealy,
      moore,
      convertedMealy,
      conversionDetails: {
        converted: moore,
        originalType: "Mealy",
        convertedType: "Moore",
        originalStateCount: mealy.states.length,
        convertedStateCount: moore.states.length,
        addedStates: [],
        explanation: ["Generated via offline fallback logic."],
        outputTracesMatch: JSON.stringify(outputTrace(mealy)) === JSON.stringify(outputTrace(moore)),
      },
      summary: `Generated locally (${queue.length} items).`,
    };
  }
}

/**
 * Registers product selection on the backend.
 */
export async function apiSelectProduct(
  code: Code,
  currentQueue: Code[],
  maxItems: number = 6
): Promise<{
  success: boolean;
  queue: Code[];
  total: number;
  snapshot: Snapshot;
  mealy: Automaton;
  moore: Automaton;
  convertedMealy: Automaton;
  conversionDetails: ConversionResult;
  message: string;
}> {
  return await fetchJson("/vending/select", {
    method: "POST",
    body: JSON.stringify({ code, currentQueue, maxItems }),
  });
}

/**
 * Confirms selection on the backend.
 */
export async function apiConfirmTransaction(
  queue: Code[],
  cursor: number
): Promise<{
  success: boolean;
  stage: string;
  cursor: number;
  snapshot: Snapshot;
  message: string;
}> {
  return await fetchJson("/vending/confirm", {
    method: "POST",
    body: JSON.stringify({ queue, cursor }),
  });
}

/**
 * Steps or advances dispensing on the backend.
 */
export async function apiDispenseStep(
  queue: Code[],
  cursor: number
): Promise<{
  success: boolean;
  cursor: number;
  snapshot: Snapshot;
  event?: Transition;
  stage: string;
  isComplete: boolean;
  message: string;
}> {
  return await fetchJson("/vending/dispense", {
    method: "POST",
    body: JSON.stringify({ queue, cursor }),
  });
}

/**
 * Resets the vending machine on the backend.
 */
export async function apiResetTransaction(
  clear: boolean = true,
  queue: Code[] = []
): Promise<{
  success: boolean;
  queue: Code[];
  cursor: number;
  stage: string;
  snapshot: Snapshot;
  mealy: Automaton;
  moore: Automaton;
  message: string;
}> {
  return await fetchJson("/vending/reset", {
    method: "POST",
    body: JSON.stringify({ clear, queue }),
  });
}

/**
 * Converts a Mealy machine to Moore machine on backend.
 */
export async function apiConvertMealyToMoore(machine: Automaton): Promise<ConversionResult> {
  return await fetchJson("/automata/convert/mealy-to-moore", {
    method: "POST",
    body: JSON.stringify({ machine }),
  });
}

/**
 * Converts a Moore machine to Mealy machine on backend.
 */
export async function apiConvertMooreToMealy(machine: Automaton): Promise<ConversionResult> {
  return await fetchJson("/automata/convert/moore-to-mealy", {
    method: "POST",
    body: JSON.stringify({ machine }),
  });
}

/**
 * Simulates input trace on backend.
 */
export async function apiSimulate(
  machine: Automaton,
  inputs: string[],
  initial?: string
): Promise<SimulationResult> {
  return await fetchJson("/automata/simulate", {
    method: "POST",
    body: JSON.stringify({ machine, inputs, initial }),
  });
}

/**
 * Validates an automaton on backend.
 */
export async function apiValidateAutomaton(machine: Automaton): Promise<ValidationResult> {
  return await fetchJson("/automata/validate", {
    method: "POST",
    body: JSON.stringify({ machine }),
  });
}
