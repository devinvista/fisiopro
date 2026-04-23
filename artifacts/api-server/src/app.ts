import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./modules/index.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requestContextMiddleware } from "./middleware/requestContext.js";
import { csrfMiddleware } from "./middleware/csrf.js";
import { PgRateLimitStore, startRateLimitCleanup } from "./middleware/rateLimitStore.js";
import {
  forgotPasswordEmailLimiter,
  resetPasswordTokenLimiter,
} from "./middleware/authRateLimits.js";
import { logger } from "./lib/logger.js";
import { initSentry, Sentry } from "./lib/sentry.js";

initSentry();

const app: Express = express();

app.set("trust proxy", 1);

// Sentry — request handler precisa vir antes de qualquer middleware/rota
if (process.env.SENTRY_DSN_BACKEND) {
  Sentry.setupExpressErrorHandler(app);
}

// Helmet — headers de segurança (CSP, HSTS em prod, etc.)
const isProd = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "img-src": ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
            "font-src": ["'self'", "data:"],
            "connect-src": ["'self'", "https://*.sentry.io", "https://res.cloudinary.com"],
            "frame-ancestors": ["'none'"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(compression());

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
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// CSRF — depois do cookieParser e do parser do body, antes das rotas /api
app.use(csrfMiddleware);

const buildLimiter = (prefix: string, max: number, windowMs = 15 * 60 * 1000) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new PgRateLimitStore(prefix),
    message: { error: "Too Many Requests", message: "Muitas requisições. Tente novamente em alguns minutos." },
    skip: (req) => req.path === "/healthz",
  });

const globalLimiter = buildLimiter("global", 500);
const authLimiter = buildLimiter("auth", 20);
const publicLimiter = buildLimiter("public", 60);
const uploadsLimiter = buildLimiter("uploads", 100);

startRateLimitCleanup();

app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/forgot-password", authLimiter, forgotPasswordEmailLimiter);
app.use("/api/auth/reset-password", authLimiter, resetPasswordTokenLimiter);
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
