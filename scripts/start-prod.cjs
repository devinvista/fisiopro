#!/usr/bin/env node
"use strict";

/**
 * FisioGest Pro — script de inicialização para produção (Hostinger / VPS)
 *
 * Ordem de execução:
 *   1. Carrega variáveis de ambiente do arquivo .env (se existir na raiz)
 *   2. Aplica migrations pendentes no banco de dados (idempotente)
 *   3. Inicia o servidor Express (index.cjs)
 *
 * Uso (a partir da raiz do projeto):
 *   node server/start.cjs
 *
 * Requer Node.js >= 20.12 (process.loadEnvFile é built-in).
 */

const path = require("path");
const { spawnSync } = require("child_process");

// ── 1. Carregar .env ──────────────────────────────────────────────────────────
// O .env deve estar na raiz do projeto (um nível acima de server/)
const envFile = path.resolve(__dirname, "..", ".env");
try {
  process.loadEnvFile(envFile);
  console.log("[start] .env carregado de:", envFile);
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("[start] Arquivo .env não encontrado — usando variáveis de ambiente já definidas no sistema.");
  } else {
    console.error("[start] Erro ao carregar .env:", err.message);
    process.exit(1);
  }
}

// ── 2. Aplicar migrations ─────────────────────────────────────────────────────
console.log("[start] Verificando e aplicando migrations pendentes...");
const migrateResult = spawnSync(
  process.execPath,
  [path.join(__dirname, "migrate.cjs")],
  { stdio: "inherit", env: process.env }
);

if (migrateResult.error) {
  console.error("[start] Falha ao iniciar migrate.cjs:", migrateResult.error.message);
  process.exit(1);
}
if (migrateResult.status !== 0) {
  console.error("[start] Migrations falharam (código " + migrateResult.status + ") — abortando.");
  process.exit(migrateResult.status || 1);
}

// ── 3. Iniciar o servidor ─────────────────────────────────────────────────────
console.log("[start] Migrations OK. Iniciando servidor Express...");
require("./index.cjs");
