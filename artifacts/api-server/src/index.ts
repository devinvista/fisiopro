import app from "./app";
import { startScheduler } from "./scheduler.js";
import { logger } from "./lib/logger.js";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  logger.info({ port: PORT }, `Server listening on port ${PORT}`);
  startScheduler();
});
