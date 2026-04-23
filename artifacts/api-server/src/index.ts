import app from "./app";
import { startScheduler } from "./scheduler/index.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT) || 3000;

process.on("uncaughtException", (err) => {
  logger.fatal({ err, type: "uncaughtException" }, "Uncaught exception — shutting down");
  setTimeout(() => process.exit(1), 100).unref();
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err, type: "unhandledRejection" }, "Unhandled promise rejection");
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, `Server listening on port ${PORT}`);
  startScheduler();
});

const shutdown = (signal: string) => {
  logger.info({ signal }, "Received shutdown signal — closing server");
  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error during server close");
      process.exit(1);
    }
    logger.info("Server closed cleanly");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Forcing shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
