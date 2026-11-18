# Vendra — Smart Vending Machine Mealy & Moore FSM Lab

An interactive, mathematically rigorous Finite State Machine (FSM) laboratory and simulator for a smart vending machine. Features interactive SVG automata diagrams, live circular lens magnifiers, Mealy & Moore state machine generation, formal Mealy-to-Moore state-splitting conversion, Moore-to-Mealy conversion, transaction guard ordering, and full backend API orchestration.

---

## 📑 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Automata Theory & Mathematical Algorithms](#automata-theory--mathematical-algorithms)
  - [Mealy Machine Specification](#mealy-machine-specification)
  - [Moore Machine Specification](#moore-machine-specification)
  - [Mealy-to-Moore Conversion (State-Splitting)](#mealy-to-moore-conversion-state-splitting)
  - [Moore-to-Mealy Conversion](#moore-to-mealy-conversion)
  - [Formal Automata Validation](#formal-automata-validation)
- [Vending Machine Transaction Lifecycle](#vending-machine-transaction-lifecycle)
- [Backend API Reference](#backend-api-reference)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Running Tests](#running-tests)
- [Production Build & Deployment](#production-build--deployment)
  - [Option A: Unified Deployment (Docker / Single Server)](#option-a-unified-deployment-docker--single-server)
  - [Option B: Decoupled Deployment (Vercel + Render / Railway)](#option-b-decoupled-deployment-vercel--render--railway)

---

## 🚀 Overview

The application demonstrates theoretical finite state automata principles applied to a physical system: a 6-item vending machine offering products `A1, A2, A3, B1, B2, B3`. Users select items, review the formal state transitions generated dynamically, step forward/backward through state transitions, replay executions, and inspect the observable output traces of equivalent Mealy and Moore automata.

Key highlights:
- **Separation of Concerns**: Mathematical automata logic is decoupled from HTTP controllers and frontend UI.
- **Dynamic FSM Generation**: Transition graphs are generated based on the actual transaction queue (including duplicates and arbitrary order).
- **Equivalence Preservation**: Observable output sequences match across both representations.
- **Full Visual Fidelity**: Retains the Figma Make interactive dashboard with animated dispensing flap, falling product rollouts, circular magnifier callouts, and `#7DFF9A` active state/transition highlighting.

---

## 🏛️ Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │               Client (React 19)              │
                    │  - Vending Machine SVG & Circular Lens       │
                    │  - Interactive Automata Graph Visualizer     │
                    │  - Transport Controls & Simulation Timeline   │
                    │  - Conversion & Split States Inspection      │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP / JSON
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │          Express Backend Server              │
                    │  - CORS & Error Handling Middleware          │
                    │  - Static Asset Provider (Production)        │
                    │  - API Routes: /health, /vending, /automata  │
                    └──────────────────────┬───────────────────────┘
                                           │ Calls
                                           ▼
      ┌────────────────────────────────────┴────────────────────────────────────┐
      │                         Automata Engine Core                            │
      ├──────────────────────┬─────────────────────┬────────────────────────────┤
      │    Mealy Engine      │    Moore Engine     │     Conversion Suite       │
      │ - Dynamic Generation │ - State Outputs     │ - State Splitting (Mealy->)│
      │ - Output on Edges    │ - Initial Outputs   │ - Edge Outputs (Moore->)   │
      │ - Step Simulator     │ - Step Simulator    │ - Trace Equivalence Verif. │
      └──────────────────────┴─────────────────────┴────────────────────────────┘
```

---

## 📐 Automata Theory & Mathematical Algorithms

### Mealy Machine Specification
A Mealy machine is formally modeled as the 6-tuple $M = (Q, \Sigma, \Delta, \delta, \lambda, q_0)$ where:
- $Q = \{S_0, S_1, S_2, S_3, S_4\}$ representing IDLE, SELECTING, READY, DISPENSING, and COMPLETE.
- $\Sigma$: Set of input alphabet symbols (`Select {code}`, `Confirm`, `Dispense`, `Dispense {code}`, `Last item dispensed`, `Reset`).
- $\Delta$: Set of output alphabet symbols (`Light {code}`, `Confirm selection`, `Open dispenser`, `Release {code}`, `Close dispenser`, `Clear transaction`).
- $\delta: Q \times \Sigma \to Q$: State transition mapping.
- $\lambda: Q \times \Sigma \to \Delta$: Transition output mapping (outputs are emitted on state transitions).
- $q_0 = S_0$: Designated initial state.

### Moore Machine Specification
A Moore machine is formally modeled as $M = (Q, \Sigma, \Delta, \delta, \lambda_M, q_0)$ where:
- $Q$: Finite set of states.
- $\lambda_M: Q \to \Delta$: Output function mapping directly from states (outputs are emitted upon entering states).
- Initial state $M_0$ emits the default initial output `"All buttons off"` before any input is consumed.

### Mealy-to-Moore Conversion (State-Splitting)
When converting a Mealy machine into an equivalent Moore machine:
1. An initial state $M_0$ with state output `"All buttons off"` is created.
2. For any destination Mealy state $S_k$, its incoming transitions may produce distinct outputs. For every unique $(S_k, \text{output})$ pair, a distinct Moore state is created:
   $$\text{Moore State} = (S_k, y) \quad \text{where } y \in \Delta$$
3. Transitions entering $S_k$ with output $y$ are redirected to the specific state $(S_k, y)$.
4. The output label is cleared from the transition arrow and attached to the Moore state.
5. In the vending machine, this splits the generic `S3` (DISPENSING) state into dedicated `DISPENSE {code}` states with outputs `Release {code}`, preserving distinct observable events.

### Moore-to-Mealy Conversion
1. For each transition from $P$ to $Q$ in the Moore machine, the transition output $\lambda(P, a)$ is assigned the state output of destination state $Q$: $\lambda_M(Q)$.
2. Outputs are stripped from the states, returning to edge-labeled outputs.

### Formal Automata Validation
The `/api/automata/validate` route checks:
- Well-formedness and presence of initial state.
- Referential integrity: all transitions connect existing states.
- Determinism: verifies absence of conflicting transitions for identical $(state, input)$ pairs.
- Graph reachability: runs Breadth-First Search (BFS) to identify connected vs unreachable states.
- Detection of terminal / deadlock states.

---

## 🔄 Vending Machine Transaction Lifecycle

The vending machine enforces strict separation of phases:

```
[IDLE (S0)] ──(Select A1)──> [SELECTING (S1)] ──(Select B2)──> [SELECTING (S1)]
                                    │
                                (Confirm)
                                    ▼
                             [READY (S2)]
                                    │
                                (Dispense)
                                    ▼
                           [DISPENSING (S3)]
                                    │
                           (Dispense items in order)
                                    │
                           (Last item dispensed)
                                    ▼
                            [COMPLETE (S4)]
                                    │
                                 (Reset)
                                    ▼
                               [IDLE (S0)]
```

Rules enforced by the backend:
1. **Selection & Dispensing are Separate**: Product buttons illuminate upon selection, but products are **never** released until the transaction is confirmed and dispensing is triggered.
2. **Sequential Queue**: Multiple products and repeated selections (e.g. `['A1', 'A1', 'B2']`) are queued and dispensed in FIFO order.
3. **Transaction Limits**: Maximum items per transaction (configurable, default 6, up to 12) and stock capacity (max 8 units per product).
4. **Guard Conditions**: Attempting to dispense before confirmation or attempting to dispense after completion returns HTTP 400 with a detailed error.

---

## 🔌 Backend API Reference

### 1. Health Check
- **`GET /api/health`**
- Returns server status, uptime, service name, and timestamp.

### 2. Automata Generation
- **`POST /api/vending/generate`**
- **Request Body**: `{ "queue": ["A1", "B2"], "cursor": 2 }`
- **Response**: `{ "success": true, "mealy": Automaton, "moore": Automaton, "convertedMealy": Automaton, "snapshot": Snapshot, "total": 3.75, "conversionDetails": ConversionResult }`

### 3. Register Selection
- **`POST /api/vending/select`**
- **Request Body**: `{ "code": "A1", "currentQueue": ["B2"], "maxItems": 6 }`
- **Response**: `{ "success": true, "queue": ["B2", "A1"], "snapshot": Snapshot, "mealy": Automaton, "moore": Automaton }`

### 4. Confirm Transaction
- **`POST /api/vending/confirm`**
- **Request Body**: `{ "queue": ["A1", "B2"], "cursor": 2 }`
- **Response**: `{ "success": true, "stage": "Ready", "cursor": 3, "snapshot": Snapshot }`

### 5. Dispense Step
- **`POST /api/vending/dispense`**
- **Request Body**: `{ "queue": ["A1", "B2"], "cursor": 3 }`
- **Response**: `{ "success": true, "cursor": 4, "stage": "Dispensing", "event": Transition, "isComplete": false }`

### 6. Reset Machine
- **`POST /api/vending/reset`**
- **Request Body**: `{ "clear": true }`
- **Response**: `{ "success": true, "queue": [], "cursor": 0, "stage": "Selection" }`

### 7. Automata Simulation
- **`POST /api/automata/simulate`**
- **Request Body**: `{ "machine": Automaton, "inputs": ["Select A1", "Confirm", "Dispense"] }`
- **Response**: `{ "success": true, "trace": [...], "finalState": "S3", "visitedStates": ["S0", "S1", "S2", "S3"] }`

### 8. Conversions
- **`POST /api/automata/convert/mealy-to-moore`**
- **`POST /api/automata/convert/moore-to-mealy`**
- Returns converted machine, state counts before/after, split state details, and step-by-step explanations.

### 9. Validation
- **`POST /api/automata/validate`**
- **Request Body**: `{ "machine": Automaton }`
- Returns `{ "valid": true, "errors": [], "warnings": [], "stats": { "stateCount": 5, "isDeterministic": true, ... } }`

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `5000` | Port for Express server |
| `HOST` | `0.0.0.0` | Bind host address |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`) |
| `CORS_ORIGIN` | `*` | Allowed CORS origins (comma-separated or wildcard) |
| `STATIC_PATH` | *(auto-detected)* | Path to compiled frontend `dist` directory |

### Frontend (`Vending Machine FSM Simulator Frontend/.env`)
| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `/api` | Backend API URL (use full URL like `https://api.example.com/api` for decoupled deployments) |

---

## 💻 Local Development Setup

### Prerequisites
- Node.js >= 20 (Node 22 or Node 24 recommended)
- `pnpm` >= 9 (`npm` or `corepack` also supported)

### 1. Install Dependencies
From the repository root:
```bash
# Install backend dependencies
cd backend && pnpm install

# Install frontend dependencies
cd "../Vending Machine FSM Simulator Frontend" && pnpm install
```

Or using root script:
```bash
pnpm run install:all
```

### 2. Start Both Services in Development Mode

**Terminal 1 (Backend on Port 5000):**
```bash
cd backend
pnpm dev
```

**Terminal 2 (Frontend on Port 8443 / 5173 with Vite proxy):**
```bash
cd "Vending Machine FSM Simulator Frontend"
pnpm dev
```

Open the preview URL in your browser. The top bar will display **`Backend online`** with a green indicator dot.

---

## 🧪 Running Tests

The test suite covers:
- Core Mealy and Moore generation
- Conversion in both directions with state splitting
- Output trace equivalence for single, multiple, and all six products
- Simulation of valid and invalid input sequences
- Transaction guard invariants (e.g. dispensing before confirmation)
- Full API integration testing over HTTP

To execute all tests from the repository root:
```bash
pnpm test
```

To run individual test suites:
```bash
# Backend unit & integration tests (Node native test runner + tsx)
pnpm run test:backend

# Frontend tests
pnpm run test:frontend
```

---

## 🚢 Production Build & Deployment

### Build Both Packages
```bash
pnpm run build
```
This produces:
- `backend/dist`: Compiled JavaScript (ES2022)
- `Vending Machine FSM Simulator Frontend/dist`: Optimized production bundle (Vite + Tailwind CSS v4)

---

### Option A: Unified Deployment (Docker / Single Server)

The backend Express server is preconfigured to serve both the REST API under `/api/*` and the compiled frontend static files for all other routes.

#### With Docker Compose:
```bash
docker compose up --build -d
```
Access the application at `http://localhost:5000`.

#### Without Docker:
```bash
# 1. Build frontend and backend
pnpm run build

# 2. Start the unified production server
cd backend
pnpm start
```
The server will log:
```
[Static] Serving frontend from: .../Vending Machine FSM Simulator Frontend/dist
🚀 Vendra FSM Simulator Backend Active
📡 URL: http://0.0.0.0:5000
```

---

### Option B: Decoupled Deployment (Vercel + Render / Railway)

#### 1. Deploy Backend (e.g. Render / Railway)
- **Root Directory**: `backend`
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `node dist/index.js`
- **Environment Variables**:
  - `PORT=5000`
  - `NODE_ENV=production`
  - `CORS_ORIGIN=https://your-frontend-app.vercel.app`

#### 2. Deploy Frontend (e.g. Vercel)
- **Root Directory**: `Vending Machine FSM Simulator Frontend`
- **Build Command**: `pnpm build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL=https://your-backend-app.onrender.com/api`

---

## 📄 License
ISC
