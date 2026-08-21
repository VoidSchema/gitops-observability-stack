import os from "node:os";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";

const appName = process.env.APP_NAME || "light-service";
const version = process.env.APP_VERSION || "0.1.0";
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "0.0.0.0";

const logger = createLogger({ name: appName });
const app = createApp({ appName, version, logger });

const server = app.listen(port, host, () => {
  logger.info("service starting", {
    app: appName,
    version,
    hostname: os.hostname(),
    port,
  });
});

function shutdown(signal) {
  logger.info("service stopping", { app: appName, signal });
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
