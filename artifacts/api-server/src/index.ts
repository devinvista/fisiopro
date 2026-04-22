import app from "./app";
import { startScheduler } from "./scheduler.js";

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startScheduler();
});
