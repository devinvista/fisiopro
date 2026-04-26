import {
  request,
  type FullConfig,
  type APIRequestContext,
} from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3000}`;

const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "admin@fisiogest.com.br",
  password: process.env.E2E_ADMIN_PASSWORD ?? "123456",
};
const PROFISSIONAL = {
  email: process.env.E2E_PROF_EMAIL ?? "fisio@fisiogest.com.br",
  password: process.env.E2E_PROF_PASSWORD ?? "123456",
};

interface LoginBody {
  token: string;
  user: { id: number; email: string; isSuperAdmin?: boolean };
  clinics?: Array<{ id: number; name: string }>;
  clinic?: { id: number; name: string };
}

async function login(
  ctx: APIRequestContext,
  creds: { email: string; password: string },
): Promise<{ cookies: any[]; body: LoginBody }> {
  const res = await ctx.post(`${BASE_URL}/api/auth/login`, {
    data: creds,
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(
      `Login failed for ${creds.email}: ${res.status()} ${await res.text()}`,
    );
  }
  const body = (await res.json()) as LoginBody;
  const cookies = (await ctx.storageState()).cookies;
  return { cookies, body };
}

async function buildStorageState(filePath: string, role: "admin" | "prof") {
  const ctx = await request.newContext();
  const creds = role === "admin" ? ADMIN : PROFISSIONAL;
  const { cookies, body } = await login(ctx, creds);
  await ctx.dispose();

  const clinic = body.clinic ?? body.clinics?.[0];
  const clinicId = clinic?.id ?? null;
  const clinics = body.clinics ?? (clinic ? [clinic] : []);

  const localStorage = [
    { name: "auth_hint", value: "1" },
    ...(clinicId !== null
      ? [{ name: "clinic_id", value: String(clinicId) }]
      : []),
    ...(clinics.length
      ? [{ name: "clinics", value: JSON.stringify(clinics) }]
      : []),
  ];

  const state = {
    cookies,
    origins: [{ origin: BASE_URL, localStorage }],
  };

  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export default async function globalSetup(_config: FullConfig) {
  // Pre-flight: ensure baseURL responds
  try {
    execSync(`curl -sf -o /dev/null ${BASE_URL}`, { stdio: "ignore" });
  } catch {
    throw new Error(
      `Dev server not reachable at ${BASE_URL}. Start it with \`pnpm run dev\` first.`,
    );
  }

  await buildStorageState(
    resolve(__dirname, ".auth/admin.json"),
    "admin",
  );
  await buildStorageState(
    resolve(__dirname, ".auth/profissional.json"),
    "prof",
  );
}
