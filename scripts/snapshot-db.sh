#!/usr/bin/env bash
# snapshot-db.sh — gera dump completo do banco antes de mudanças estruturais.
#
# Uso:
#   ./scripts/snapshot-db.sh                # dump comprimido em .snapshots/
#   ./scripts/snapshot-db.sh --tag sprint-1 # adiciona tag ao nome do arquivo
#
# Restaurar:
#   gunzip -c .snapshots/dump-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERRO: DATABASE_URL não está definida." >&2
  exit 1
fi

TAG=""
if [ "${1:-}" = "--tag" ] && [ -n "${2:-}" ]; then
  TAG="-${2}"
fi

mkdir -p .snapshots
TS=$(date -u +"%Y%m%d-%H%M%S")
OUT=".snapshots/dump-${TS}${TAG}.sql.gz"

echo "[snapshot-db] Gerando dump em ${OUT}..."
pg_dump --no-owner --no-acl --format=plain "${DATABASE_URL}" | gzip > "${OUT}"

SIZE=$(du -h "${OUT}" | cut -f1)
echo "[snapshot-db] OK — ${OUT} (${SIZE})"
echo "[snapshot-db] Para restaurar: gunzip -c ${OUT} | psql \"\$DATABASE_URL\""
