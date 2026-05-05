#!/usr/bin/env node
"use strict";

/**
 * FisioGest Pro — script de inicialização para produção (Hostinger / VPS)
 *
 * Ordem de execução:
 *   1. Carrega variáveis de ambiente do arquivo .env (se existir na raiz)
 *   2. Aplica migrations pendentes — ou faz baseline se MIGRATE_BASELINE=true
 *   3. Inicia o servidor Express (index.cjs)
 *
 * Uso (a partir da raiz do projeto):
 *   node server/start.cjs
 *
 * Variáveis de controle de migrations:
 *   MIGRATE_BASELINE=true   — primeira publicação em banco já existente
 *                              (criado via drizzle-kit push). Registra todas
 *                              as migrations como aplicadas sem executar o SQL.
 *                              Use apenas UMA VEZ; remova a variável depois.
 *   MIGRATE_SKIP=true       — pula migrations completamente (não recomendado).
 *
 * Requer Node.js >= 20.12 (process.loadEnvFile é built-in).
 */

const path = require("path");
const { spawnSync } = require("child_process");

// ── 1. Carregar .env ──────────────────────────────────────────────────────────
const envFile = path.resolve(__dirname, "..", ".env");
try {
  process.loadEnvFile(envFile);
  console.log("[start] .env carregado de:", envFile);
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("[start] Arquivo .env não encontrado — usando variáveis de ambiente do sistema.");
  } else {
    console.error("[start] Erro ao carregar .env:", err.message);
    process.exit(1);
  }
}

// ── 2. Migrations ─────────────────────────────────────────────────────────────
const isBaseline = process.env.MIGRATE_BASELINE === "true";
const isSkip     = process.env.MIGRATE_SKIP     === "true";

if (isSkip) {
  console.log("[start] MIGRATE_SKIP=true — migrations ignoradas.");
} else {
  const migrateArgs = [path.join(__dirname, "migrate.cjs")];
  if (isBaseline) {
    migrateArgs.push("--baseline");
    console.log("[start] MIGRATE_BASELINE=true — registrando migrations como aplicadas (sem executar SQL)...");
    console.log("[start] ⚠️  Use esta opção apenas UMA VEZ na primeira publicação.");
    console.log("[start]    Após concluir, remova MIGRATE_BASELINE do .env.");
  } else {
    console.log("[start] Verificando e aplicando migrations pendentes...");
  }

  const result = spawnSync(process.execPath, migrateArgs, {
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error("[start] Falha ao executar migrate.cjs:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error("[start] Migrations falharam (código " + result.status + ") — abortando.");
    process.exit(result.status || 1);
  }

  if (isBaseline) {
    console.log("[start] Baseline concluído. Remova MIGRATE_BASELINE=true do .env antes do próximo deploy.");
  } else {
    console.log("[start] Migrations OK.");
  }
}

// ── 3. Iniciar o servidor ─────────────────────────────────────────────────────
console.log("[start] Iniciando servidor Express...");
require("./index.cjs");
