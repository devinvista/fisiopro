import { test } from "@playwright/test";
import { assertMobilePage, type MobileCase } from "./_shared";

const CASES: MobileCase[] = [
  {
    name: "SuperAdmin — clínicas",
    path: "/superadmin",
    auditItems: ["#3"],
  },
];

test.describe("Mobile audit (superadmin) — viewport 375×812", () => {
  for (const c of CASES) {
    test(`${c.name} (${c.auditItems.join(", ")})`, async ({ page }, info) => {
      await assertMobilePage(page, c, info);
    });
  }
});
