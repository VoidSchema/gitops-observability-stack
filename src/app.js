import os from "node:os";
import express from "express";
import { createLogger } from "./logger.js";

export function createApp(options = {}) {
  const appName = options.appName || process.env.APP_NAME || "hello-service";
  const version = options.version || process.env.APP_VERSION || "0.1.0";
  const greeting =
    options.greeting ||
    process.env.GREETING ||
    "Hello from the GitOps observability pipeline!";
  const logger = options.logger || createLogger({ name: appName });

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info("request completed", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration_ms: Math.round(durationMs * 100) / 100,
      });
    });
    next();
  });

  app.get("/", (req, res) => {
    logger.info("root endpoint hit", { endpoint: "/" });
    res.json({ message: greeting, hostname: os.hostname(), version });
  });

  app.get("/health", (req, res) => {
    logger.info("health check ok", { endpoint: "/health" });
    res.json({ status: "ok" });
  });

  return app;
}