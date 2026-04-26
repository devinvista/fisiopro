import { expect, type Page, type ConsoleMessage } from "@playwright/test";

export const VIEWPORT = { width: 375, height: 812 } as const;

export const IGNORED_CONSOLE_PATTERNS: RegExp[] = [
  /\[sentry\]/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  // Network errors logged by the browser when API calls return non-fatal
  // status codes. The mobile audit checks layout, not authorization, so we
  // ignore 401/403/404/429 noise from optional sub-features.
  /Failed to load resource: the server responded with a status of (401|403|404|429)/i,
];

export interface MobileCase {
  name: string;
  path: string;
  expectVisible?: string[];
  auditItems: string[];
}

export function attachConsoleWatcher(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on("pageerror", (err) => {
    errors.push(`pageerror: ${err.message}`);
  });
  return { errors };
}

/**
 * Asserts that the page renders correctly on a mobile viewport:
 *  - HTTP < 400
 *  - No horizontal overflow
 *  - Required selectors visible
 *  - No JS console errors
 *  - Screenshot attached to the report
 */
export async function assertMobilePage(
  page: Page,
  c: MobileCase,
  testInfo: import("@playwright/test").TestInfo,
) {
  await page.setViewportSize({ ...VIEWPORT });
  const { errors } = attachConsoleWatcher(page);

  const response = await page.goto(c.path, {
    waitUntil: "networkidle",
    timeout: 25_000,
  });

  expect(
    response,
    `Expected a response navigating to ${c.path}`,
  ).not.toBeNull();
  expect(
    response!.status(),
    `Got HTTP ${response!.status()} for ${c.path}`,
  ).toBeLessThan(400);

  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
    };
  });
  expect(
    overflow.scrollWidth,
    `Page ${c.path} overflows horizontally on mobile (scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth})`,
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);

  for (const selector of c.expectVisible ?? []) {
    await expect(
      page.locator(selector).first(),
      `${selector} not visible on ${c.path}`,
    ).toBeVisible({ timeout: 5_000 });
  }

  await testInfo.attach(`${c.name}.png`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  expect(
    errors,
    `Console errors on ${c.path}:\n${errors.join("\n")}`,
  ).toEqual([]);
}
