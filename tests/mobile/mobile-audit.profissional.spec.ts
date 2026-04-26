import { test } from "@playwright/test";
import { assertMobilePage, type MobileCase } from "./_shared";

const CASES: MobileCase[] = [
  {
    name: "Dashboard",
    path: "/dashboard",
    auditItems: ["#6", "#7", "#15", "#16"],
  },
  {
    name: "Agenda",
    path: "/agenda",
    auditItems: ["#1", "#2"],
  },
  {
    name: "Pacientes — listagem",
    path: "/pacientes",
    auditItems: ["#17", "#18"],
  },
  {
    name: "Financeiro",
    path: "/financeiro",
    auditItems: ["#10", "#19"],
  },
  {
    name: "Relatórios financeiros",
    path: "/financeiro/relatorios",
    auditItems: ["#11", "#12"],
  },
  {
    name: "Configurações",
    path: "/configuracoes",
    auditItems: ["#5", "#22"],
  },
  {
    name: "Catálogo — procedimentos",
    path: "/catalogo/procedimentos",
    auditItems: ["#13"],
  },
];

test.describe("Mobile audit (profissional) — viewport 375×812", () => {
  for (const c of CASES) {
    test(`${c.name} (${c.auditItems.join(", ")})`, async ({ page }, info) => {
      await assertMobilePage(page, c, info);
    });
  }
});
