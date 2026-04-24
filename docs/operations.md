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

## Workflows e Portas — Configuração Canônica (NÃO REGREDIR)

> ⚠️ **Esta configuração já causou 502 Bad Gateway no preview duas vezes.** Antes de mexer em `.replit`, `package.json` (script `dev`) ou em qualquer `artifact.toml`, leia esta seção inteira.

### Mapeamento canônico de portas

| Serviço | Filtro do pacote | Porta local | Caminho proxy | Fonte da verdade |
|---|---|---|---|---|
| Frontend (Vite) | `@workspace/fisiogest` | **3000** | `/` | `artifacts/fisiogest/.replit-artifact/artifact.toml` |
| API Server (Express) | `@workspace/api-server` | **8080** | `/api` | `artifacts/api-server/.replit-artifact/artifact.toml` |
| Mockup Sandbox (Vite) | `@workspace/mockup-sandbox` | **8081** | `/__mockup` | `artifacts/mockup-sandbox/.replit-artifact/artifact.toml` |

O proxy reverso do Replit escuta na porta **80** (externalPort) e roteia por `paths` declarados em cada `artifact.toml`. **Cada `localPort` deve aparecer no máximo uma vez** em `[[ports]]` do `.replit`.

### Regras de ouro

1. **Nunca** force `PORT` no script raiz `pnpm run dev` para um valor diferente do `artifact.toml` correspondente — quem manda no port é o `[services.env]` de cada artifact.
2. **Nunca** adicione um segundo bloco `[[ports]]` mapeando outro `localPort` para `externalPort = 80`. Dois mapeamentos para a mesma porta externa = 502 intermitente.
3. **Nunca** use `localhost:5000`, `localhost:3001`, `localhost:3002` etc. em código de aplicação ou configurações — só `3000`, `8080`, `8081`.
4. O `waitForPort` de qualquer workflow manual em `.replit` deve ser **3000** (a porta do frontend, que é o serviço "principal" para o webview).

### Workflows que devem existir

Os workflows são **gerenciados automaticamente** pelo sistema de artifacts a partir dos `artifact.toml`:

| Workflow | Origem | O que faz |
|---|---|---|
| `artifacts/fisiogest: web` | `artifacts/fisiogest/.replit-artifact/artifact.toml` | Sobe Vite (3000) + API (8080) via `concurrently`. **É o equivalente ao botão Run.** |
| `artifacts/api-server: API Server` | `artifacts/api-server/.replit-artifact/artifact.toml` | Apenas monitora porta 8080 (a API real é subida pelo workflow do fisiogest). |
| `artifacts/mockup-sandbox: Component Preview Server` | `artifacts/mockup-sandbox/.replit-artifact/artifact.toml` | Sobe sob demanda na 8081 quando o canvas pede preview de componente. |

Se houver também um workflow manual `Start application` rodando `pnpm run dev`, ele **duplica** o que os artifact workflows já fazem e briga pelas mesmas portas — Vite cai em 3001/3002/3003 e o `mockup-sandbox` falha com `Port 8081 is already in use`. Mantenha somente os workflows de artifact.

### Diagnóstico rápido de 502 Bad Gateway

```bash
# 1. Confirmar que o público responde
curl -s -o /dev/null -w "%{http_code}\n" https://<repl-url>/
curl -s -o /dev/null -w "%{http_code}\n" https://<repl-url>/api/healthz
# Esperado: 200 e 200

# 2. Conferir quem está nas portas locais
ss -tlnp 2>/dev/null | grep -E ":(3000|8080|8081) "
# Esperado: exatamente 1 processo por porta (3000=vite, 8080=node api, 8081=vite mockup)

# 3. Conferir mapeamento de proxy
grep -A1 "\[\[ports\]\]" .replit
# Esperado: APENAS um bloco "localPort = 3000 / externalPort = 80"
```

Se o `ss` mostrar processos duplicados ou Vite em 3001+/3003+, há um workflow extra rodando `pnpm run dev` em paralelo aos artifacts. Pare o workflow manual.

