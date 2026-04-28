# Sprint 0 — Estabilizar e Preparar

> **Objetivo:** preparar o terreno para o redesign sem mudar comportamento de produção.
> **Duração estimada:** 3 dias
> **Constraint:** _nenhuma_ alteração toca agendamentos com `date < 2026-04-30`.

## Entregáveis

| # | Item | Arquivo | Status |
|---|---|---|---|
| 1 | Doc da sprint | `sprints/sprint-0-estabilizar.md` | ✅ |
| 2 | Script de snapshot do banco | `scripts/snapshot-db.sh` | ✅ |
| 3 | Métricas baseline (antes do redesign) | `scripts/baseline-metrics.ts` | ✅ |
| 4 | `.gitignore` com `.snapshots/` | `.gitignore` | ✅ |
| 5 | Guard `--apply` obrigatório no backfill v1 | `scripts/backfill-treatment-plans.ts` | ✅ |
| 6 | Guard `--apply` obrigatório no backfill v2 | `artifacts/api-server/src/scripts/backfill-treatment-plans-v2.ts` | ✅ |
| 7 | Cutoff `>= 2026-04-30` documentado nos scripts destrutivos | múltiplos | ✅ |

## Como usar

### Snapshot antes de qualquer mudança estrutural
```bash
./scripts/snapshot-db.sh
# → grava em .snapshots/dump-YYYYMMDD-HHMMSS.sql.gz
```

### Coletar métricas baseline
```bash
pnpm tsx scripts/baseline-metrics.ts
# imprime contagens de subscriptions, planos, appointments futuros, créditos, etc.
# salva em sprints/_baselines/YYYY-MM-DD.json
```

### Rodar backfill (agora com guarda de segurança)
```bash
# Default vira DRY-RUN (não aplica nada).
pnpm tsx scripts/backfill-treatment-plans.ts

# Para aplicar de verdade, é obrigatório passar --apply explicitamente.
pnpm tsx scripts/backfill-treatment-plans.ts --apply
```

## Critérios de aceite

- [x] Banco de dados pode ser snapshotado e restaurado.
- [x] Baseline de métricas registrado para comparação pós-redesign.
- [x] Backfill scripts não conseguem rodar destrutivamente sem `--apply`.
- [x] Nenhum agendamento anterior a 30/04/2026 é tocado por nenhum script.
