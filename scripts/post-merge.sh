#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm run build:libs
# Aplica migrations pendentes (idempotente). Se o DB ainda não tiver a tabela
# de migrations e já existir via push, rode 1× manualmente: `pnpm db:baseline`.
pnpm run db:migrate
