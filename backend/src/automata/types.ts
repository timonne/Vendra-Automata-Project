export const PRODUCTS = [
  { code: "A1", name: "Classic Cola", price: 1.5, color: "#ef645d", type: "bottle" },
  { code: "A2", name: "Sea Salt Chips", price: 2.0, color: "#68a5ef", type: "bag" },
  { code: "A3", name: "Sparkling Lime", price: 1.75, color: "#83c998", type: "can" },
  { code: "B1", name: "Berry Energy", price: 2.5, color: "#b38ada", type: "can" },
  { code: "B2", name: "Orange Juice", price: 2.25, color: "#ecb456", type: "bottle" },
  { code: "B3", name: "Mint Chocolate", price: 1.75, color: "#6ac9b8", type: "bar" },
] as const;

export type Code = (typeof PRODUCTS)[number]["code"];
export type Product = (typeof PRODUCTS)[number];
export type Kind = "select" | "confirm" | "open" | "release" | "complete" | "reset";
export type MachineType = "Mealy" | "Moore";

export interface Transition {
  id: string;
  from: string;
  to: string;
  input: string;
  output: string;
  kind: Kind;
  code?: Code;
  order: number;
}

export interface State {
  id: string;
  name: string;
  output?: string;
  purpose: string;
  introduced?: boolean;
}

export interface Automaton {
  type: MachineType;
  states: State[];
  transitions: Transition[];
  initial: string;
}

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
  originalType: MachineType;
  convertedType: MachineType;
  originalStateCount: number;
  convertedStateCount: number;
  addedStates: AddedStateInfo[];
  explanation: string[];
  outputTracesMatch: boolean;
  originalTrace: string[];
  convertedTrace: string[];
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

export const getProduct = (code: Code): Product | undefined => {
  return PRODUCTS.find((p) => p.code === code);
};

export const isValidCode = (code: string): code is Code => {
  return PRODUCTS.some((p) => p.code === code);
};
