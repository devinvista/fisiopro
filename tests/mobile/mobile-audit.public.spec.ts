import { test } from "@playwright/test";
import { assertMobilePage, type MobileCase } from "./_shared";

const CASES: MobileCase[] = [
  {
    name: "Landing page",
    path: "/",
    auditItems: ["#24"],
  },
  {
    name: "Login",
    path: "/login",
    expectVisible: ["input#identifier", "input#password"],
    auditItems: ["#21"],
  },
  {
    name: "Cadastro",
    path: "/register",
    auditItems: ["#23", "#26"],
  },
];

test.describe("Mobile audit (público) — viewport 375×812", () => {
  for (const c of CASES) {
    test(`${c.name} (${c.auditItems.join(", ")})`, async ({ page }, info) => {
      await assertMobilePage(page, c, info);
    });
  }
});
