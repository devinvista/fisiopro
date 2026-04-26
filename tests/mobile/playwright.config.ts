import { defineConfig, devices } from "@playwright/test";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * On Replit (NixOS) we cannot rely on Playwright's bundled Chromium because the
 * downloaded binary is dynamically linked against system libs that don't exist
 * in standard paths. Instead we use the Nix-provided `chromium` binary.
 */
function resolveChromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  }
  try {
    return execSync("command -v chromium", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const chromiumPath = resolveChromiumPath();
const adminState = resolve(__dirname, ".auth/admin.json");
const profState = resolve(__dirname, ".auth/profissional.json");

export default defineConfig({
  testDir: ".",
  globalSetup: resolve(__dirname, "global-setup.ts"),
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 1,
  timeout: 45_000,
  reporter: [["list"]],
  outputDir: "./.results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  projects: [
    {
      name: "public",
      testMatch: /mobile-audit\.public\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices["iPhone 13"].userAgent,
      },
    },
    {
      name: "admin",
      testMatch: /mobile-audit\.admin\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices["iPhone 13"].userAgent,
        storageState: adminState,
      },
    },
    {
      name: "profissional",
      testMatch: /mobile-audit\.profissional\.spec\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: devices["iPhone 13"].userAgent,
        storageState: profState,
      },
    },
  ],
});
