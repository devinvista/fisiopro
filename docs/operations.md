## Tratamento centralizado de erros (api-server)

A partir da sessão de abril/2026, o api-server usa um middleware central de erros + wrapper `asyncHandler`:

- `src/utils/httpError.ts` — classe `HttpError` com helpers estáticos (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`).
- `src/utils/asyncHandler.ts` — wrapper que captura promessas rejeitadas e encaminha para `next(err)`.
- `src/middleware/errorHandler.ts` — middleware registrado no fim de `app.ts`. Converte `HttpError` (status configurado), `ZodError` (400 com lista de issues) e qualquer outro erro (500). Em produção, oculta detalhes da mensagem de erros não esperados.

**Padrão recomendado para handlers novos**:
```ts
router.get("/x", requirePermission("..."), asyncHandler(async (req, res) => {
  const item = await repo.find(id);
  if (!item) throw HttpError.notFound("Item não encontrado");
  res.json(item);
}));
```
Refatorados nesse padrão (referência): `modules/financial/dashboard/`, `modules/financial/analytics/`. Os demais handlers ainda usam `try/catch` manual e podem ser migrados gradualmente sem quebrar compatibilidade.

## Testes (vitest)

Suíte localizada em `artifacts/api-server/src/services/__tests__/` (config raiz: `vitest.config.ts`).
- Helpers puros: `dateUtils.test.ts`, `financialReportsService.test.ts` (cobre tipos de receita ativa, intervalos de mês incluindo bissextos, créditos por sessão/semana).
- Lógica de serviços com **DB mockado** via proxy chainable: `subscriptionService.test.ts`, `billingService.test.ts`, `policyService.test.ts`. O helper `dbMock.ts` simula `db.select/insert/update/delete` enfileirando resultados.
- Total atual: **82 testes passando**.
- Comando: `pnpm exec vitest run`.

> Bug exposto pela cobertura nova: o `subscriptionService` antigo executava `continue` no passo 3 mesmo quando a assinatura já estava overdue, tornando o passo 4 (suspender após grace period) inalcançável. Corrigido com guarda `paymentStatus !== "overdue"` e remoção do `continue`.

