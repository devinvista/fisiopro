import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import router from "./routes";

const app: Express = express();

app.set("trust proxy", 1);

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Muitas requisições. Tente novamente em alguns minutos." },
  skip: (req) => req.path === "/healthz",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Muitas tentativas de login. Tente novamente em 15 minutos." },
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.resolve(process.cwd(), "artifacts/fisiogest/dist/public");
  app.use(express.static(publicDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Global Error Handler]", err);
  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ error: "Internal Server Error", message });
});

export default app;
