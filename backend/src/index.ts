import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app.js";

const PORT = parseInt(process.env.PORT || "5000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const app = createApp();

const server = app.listen(PORT, HOST, () => {
  console.log(`=========================================`);
  console.log(`🚀 Vendra FSM Simulator Backend Active`);
  console.log(`📡 URL: http://${HOST}:${PORT}`);
  console.log(`🩺 Health: http://${HOST}:${PORT}/api/health`);
  console.log(`⚙️  Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`=========================================`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("Process terminated.");
  });
});
