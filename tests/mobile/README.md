# Mobile Audit — testes visuais (Playwright)

Suíte automatizada que valida cada página do `docs/mobile-audit.md` em
viewport **375 × 812** (iPhone 13). Garante que:

1. A página carrega (HTTP < 400).
2. Não há overflow horizontal (`scrollWidth > clientWidth`).
3. Não há erros de console JS.
4. Anexa um screenshot full-page de cada tela ao relatório.

## Pré-requisitos

* O servidor de dev precisa estar rodando em `http://localhost:3000`
  (`pnpm run dev`).
* Banco com dados de demo: `pnpm db:seed-demo` (cria `admin@fisiogest.com.br`
  e `fisio@fisiogest.com.br`, senha `123456`).

## Como rodar

```bash
pnpm test:mobile                 # roda toda a suíte
pnpm test:mobile --grep Login    # só os casos cujo nome bate com "Login"
pnpm test:mobile --headed        # vê o browser abrir (útil pra debug)
```

## Variáveis de ambiente opcionais

| Var | Default | Para que serve |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` | URL base do app |
| `E2E_PORT`     | `3000`                  | Porta (se não passar `BASE_URL`) |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | seeds | Conta superadmin |
| `E2E_PROF_EMAIL`  / `E2E_PROF_PASSWORD`  | seeds | Conta profissional |

## Screenshots

São anexados ao relatório do Playwright e ficam em
`tests/mobile/.results/` (já no `.gitignore`).
