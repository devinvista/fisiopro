import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./modules/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { logger } from "./lib/logger.js";
import { initSentry, Sentry } from "./lib/sentry.js";

initSentry();

const app: Express = express();

app.set("trust proxy", 1);

// Sentry — request handler precisa vir antes de qualquer middleware/rota
if (process.env.SENTRY_DSN_BACKEND) {
  Sentry.setupExpressErrorHandler(app);
}

app.use(requestContextMiddleware);
app.use(
  pinoHttp({
    logger,
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    serializers: {
      req: (req) => ({ method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    autoLogging: { ignore: (req) => req.url === "/healthz" },
  }),
);

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

// Rotas públicas (sem auth) — booking, lookup de paciente, planos públicos.
// Limite mais apertado para evitar abuso/scraping/enumeração.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Muitas requisições. Tente novamente em alguns minutos." },
});

// Upload de arquivos (autenticado, mas custoso) — limite por IP.
const uploadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too Many Requests", message: "Muitos uploads. Tente novamente em alguns minutos." },
});

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/public", publicLimiter);
app.use("/api/storage/uploads", uploadsLimiter);

app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const publicDir = path.resolve(process.cwd(), "artifacts/fisiogest/dist/public");
  app.use(express.static(publicDir));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

app.use(errorHandler);

export default app;
