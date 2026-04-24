import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

vi.mock("../../utils/cloudinary.js", () => ({
  cloudinary: {
    uploader: {
      upload_stream: (
        _opts: unknown,
        cb: (err: unknown, data: { secure_url: string; bytes: number; format: string }) => void,
      ) => {
        return {
          end: () => cb(null, { secure_url: "https://res.cloudinary.com/x/y/test.png", bytes: 42, format: "png" }),
        };
      },
    },
  },
  generateUploadSignature: vi.fn(async () => ({
    signature: "sig",
    timestamp: 1,
    cloud_name: "c",
    api_key: "k",
    folder: "f",
  })),
}));

vi.mock("../../middleware/auth.js", () => ({
  authMiddleware: (
    req: express.Request & { userId?: number; clinicId?: number },
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    req.userId = 1;
    req.clinicId = 1;
    next();
  },
}));

import storageRouter from "./storage.routes.js";
import { csrfMiddleware } from "../../middleware/csrf.js";
import { CSRF_COOKIE, AUTH_COOKIE } from "../../middleware/cookies.js";

function buildApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(csrfMiddleware);
  app.use("/api/storage", storageRouter);
  return app;
}

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = buildApp().listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makePngFormData() {
  const fd = new FormData();
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" });
  fd.append("file", png, "test.png");
  fd.append("folder", "fisiogest/test");
  return fd;
}

describe("storage upload routes", () => {
  it("succeeds at /api/storage/uploads/proxy with valid CSRF + auth cookies", async () => {
    const csrfToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const res = await fetch(`${baseUrl}/api/storage/uploads/proxy`, {
      method: "POST",
      headers: {
        cookie: `${AUTH_COOKIE}=fake-jwt; ${CSRF_COOKIE}=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: makePngFormData(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { secure_url: string };
    expect(body.secure_url).toMatch(/^https:\/\//);
  });

  it("rejects with 403 when CSRF header is missing (regression: catches wrong route paths too)", async () => {
    const csrfToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const res = await fetch(`${baseUrl}/api/storage/uploads/proxy`, {
      method: "POST",
      headers: { cookie: `${AUTH_COOKIE}=fake-jwt; ${CSRF_COOKIE}=${csrfToken}` },
      body: makePngFormData(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for the legacy/wrong path /api/uploads/proxy (NOT mounted)", async () => {
    const csrfToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const res = await fetch(`${baseUrl}/api/uploads/proxy`, {
      method: "POST",
      headers: {
        cookie: `${AUTH_COOKIE}=fake-jwt; ${CSRF_COOKIE}=${csrfToken}`,
        "x-csrf-token": csrfToken,
      },
      body: makePngFormData(),
    });
    expect(res.status).toBe(404);
  });
});
