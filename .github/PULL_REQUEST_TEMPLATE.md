## Resumo

<!-- O que esta PR faz e por quê. 2-4 frases. -->

## Tipo de mudança

- [ ] Bugfix
- [ ] Feature
- [ ] Refatoração (sem mudança funcional)
- [ ] Performance
- [ ] Mudança de schema do banco (drizzle)
- [ ] Documentação / chore

## Escopo

- [ ] Backend (`artifacts/api-server`)
- [ ] Frontend (`artifacts/fisiogest`)
- [ ] Lib compartilhada (`lib/*`)
- [ ] Scheduler / jobs
- [ ] Domínio financeiro / billing (exige revisão dupla)

## Checklist

- [ ] `pnpm typecheck` passa
- [ ] `pnpm lint` passa
- [ ] `pnpm test` passa
- [ ] Se mexi em rota pública (`*.routes.ts`): atualizei `lib/api-spec/openapi.yaml` e regenerei o cliente
- [ ] Se mexi no schema (`lib/db/src/schema/`): gerei migration (`pnpm db:generate`) ou justifiquei o uso de `db:push`
- [ ] Atualizei `replit.md` / `docs/` se mudei arquitetura, fluxo de billing, regras de negócio críticas ou rotas
- [ ] Adicionei testes para regras novas (regra: services e helpers têm cobertura)
- [ ] Sem `console.log` deixado para trás
- [ ] Sem secret hardcoded

## Screenshots / GIFs (se UI)

<!-- antes/depois -->

## Riscos e plano de rollback

<!-- O que pode quebrar? Como reverter? -->

## Issues relacionadas

Closes #
