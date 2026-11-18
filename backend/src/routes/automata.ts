import { Router, type Request, type Response } from "express";
import { type Automaton } from "../automata/types.js";
import { simulateMealy } from "../automata/mealy.js";
import { simulateMoore } from "../automata/moore.js";
import { convertMealyToMoore, convertMooreToMealy } from "../automata/conversion.js";
import { validateAutomaton } from "../automata/validator.js";

export const automataRouter = Router();

/**
 * POST /api/automata/simulate
 * Simulates a sequence of inputs over a Mealy or Moore machine.
 */
automataRouter.post("/simulate", (req: Request, res: Response) => {
  try {
    const { machine, inputs, initial } = req.body as {
      machine: Automaton;
      inputs: string[];
      initial?: string;
    };

    if (!machine) {
      return res.status(400).json({
        success: false,
        error: "Missing 'machine' object in request body.",
      });
    }

    if (!inputs || !Array.isArray(inputs)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'inputs' array in request body.",
      });
    }

    const validation = validateAutomaton(machine);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid automaton: ${validation.errors.join("; ")}`,
        validation,
      });
    }

    const result =
      machine.type === "Mealy"
        ? simulateMealy(machine, inputs, initial)
        : simulateMoore(machine, inputs, initial);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to simulate automaton execution.",
    });
  }
});

/**
 * POST /api/automata/convert/mealy-to-moore
 * Converts a Mealy machine into an equivalent Moore machine with split state details.
 */
automataRouter.post("/convert/mealy-to-moore", (req: Request, res: Response) => {
  try {
    const { machine } = req.body as { machine: Automaton };

    if (!machine) {
      return res.status(400).json({
        success: false,
        error: "Missing 'machine' in request body.",
      });
    }

    if (machine.type !== "Mealy") {
      return res.status(400).json({
        success: false,
        error: `Expected machine of type 'Mealy', received '${machine.type}'.`,
      });
    }

    const conversion = convertMealyToMoore(machine);
    res.json({
      success: true,
      ...conversion,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || "Failed to convert Mealy to Moore machine.",
    });
  }
});

/**
 * POST /api/automata/convert/moore-to-mealy
 * Converts a Moore machine into an equivalent Mealy machine.
 */
automataRouter.post("/convert/moore-to-mealy", (req: Request, res: Response) => {
  try {
    const { machine } = req.body as { machine: Automaton };

    if (!machine) {
      return res.status(400).json({
        success: false,
        error: "Missing 'machine' in request body.",
      });
    }

    if (machine.type !== "Moore") {
      return res.status(400).json({
        success: false,
        error: `Expected machine of type 'Moore', received '${machine.type}'.`,
      });
    }

    const conversion = convertMooreToMealy(machine);
    res.json({
      success: true,
      ...conversion,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: err.message || "Failed to convert Moore to Mealy machine.",
    });
  }
});

/**
 * POST /api/automata/validate
 * Validates an automaton against formal automata criteria.
 */
automataRouter.post("/validate", (req: Request, res: Response) => {
  try {
    const { machine } = req.body as { machine: Automaton };
    const validation = validateAutomaton(machine);
    res.json({
      success: true,
      ...validation,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message || "Failed to validate automaton.",
    });
  }
});
