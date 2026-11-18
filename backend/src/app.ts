import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { healthRouter } from "./routes/health.js";
import { vendingRouter } from "./routes/vending.js";
import { automataRouter } from "./routes/automata.js";

export function createApp() {
  const app = express();

  // CORS configuration
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
    : ["http://localhost:5173", "http://localhost:8443", "http://localhost:3000"];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        // Allow localhost on any port for development flexibility
        if (/^http:\/\/localhost(:\d+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive default for ease of testing & review
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(express.json({ limit: "5mb" }));

  // Request logger in development
  if (process.env.NODE_ENV !== "test") {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const now = new Date().toISOString();
      console.log(`[${now}] ${req.method} ${req.url}`);
      next();
    });
  }

  // API Routes
  app.use("/api/health", healthRouter);
  app.use("/api/vending", vendingRouter);
  app.use("/api/automata", automataRouter);

  // Optional: Serve frontend static build if built
  const candidatePaths = [
    process.env.STATIC_PATH,
    path.resolve(process.cwd(), "../Vending Machine FSM Simulator Frontend/dist"),
    path.resolve(process.cwd(), "Vending Machine FSM Simulator Frontend/dist"),
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(process.cwd(), "public"),
  ].filter(Boolean) as string[];

  const resolvedDistPath = candidatePaths.find((p) => fs.existsSync(p));
  if (resolvedDistPath) {
    console.log(`[Static] Serving frontend from: ${resolvedDistPath}`);
    app.use(express.static(resolvedDistPath));
    app.get("*", (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(resolvedDistPath, "index.html"));
    });
  }

  // 404 handler for API routes
  app.use("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: "API endpoint not found.",
    });
  });

  // Global Error Handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal server error.",
    });
  });

  return app;
}
