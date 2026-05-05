import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile, copyFile, writeFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dependências bundladas junto com o código-fonte da API
const allowlist = [
  "bcryptjs",
  "cors",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "jsonwebtoken",
  "pg",
  "zod",
];

// Raiz do monorepo (dois níveis acima de artifacts/api-server)
const monorepoRoot = path.resolve(__dirname, "..", "..");

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  // ── 1. Bundle principal (API Express) ─────────────────────────────────────
  console.log("Building api-server (index.cjs)...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  const isDev = process.env.BUILD_MODE === "development";
  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "index.cjs"),
    minify: !isDev,
    sourcemap: isDev,
    external: externals,
    logLevel: "info",
  });
  console.log("Build complete: dist/index.cjs");

  // ── 2. Bundle de migrations (migrate.cjs) ──────────────────────────────────
  // Bundla tudo (drizzle-orm + pg estão no allowlist e são auto-suficientes).
  // O script usa process.cwd() para localizar db/migrations/, portanto funciona
  // corretamente quando executado a partir da raiz do projeto no ZIP de produção.
  console.log("Building migrate bundle (migrate.cjs)...");
  await esbuild({
    entryPoints: [path.resolve(monorepoRoot, "scripts/migrate-prod.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "migrate.cjs"),
    external: [],
    minify: !isDev,
    logLevel: "info",
  });
  console.log("Build complete: dist/migrate.cjs");

  // ── 3. Script de startup (start.cjs) ──────────────────────────────────────
  // Script CJS que carrega .env → executa migrate.cjs → inicia index.cjs.
  // É o ponto de entrada recomendado para produção (Hostinger / PM2 / systemd).
  const startSrc = path.resolve(monorepoRoot, "scripts/start-prod.cjs");
  await copyFile(startSrc, path.resolve(distDir, "start.cjs"));
  console.log("Copied: dist/start.cjs");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
