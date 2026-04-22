# Template oficial de módulo backend

Este documento define o **padrão único** que todo módulo dentro de
`artifacts/api-server/src/modules/<domain>/<feature>/` deve seguir.

> **Por que padronizar?** Reduz custo cognitivo, facilita testes, isola
> regras de negócio do transporte HTTP, viabiliza substituir ou cachear o
> acesso ao banco sem tocar nos controllers e mantém auditoria de
> tenancy (`clinicId`) num único ponto por domínio.

---

## Estrutura de arquivos

```
modules/<domain>/<feature>/
├── <feature>.routes.ts            # Express handlers — controller fino
├── <feature>.service.ts           # Regras de negócio (puras, testáveis)
├── <feature>.repository.ts        # Queries Drizzle (acesso ao banco)
├── <feature>.schemas.ts           # Schemas zod específicos do módulo
├── <feature>.errors.ts            # (opcional) Erros de domínio tipados
├── <feature>.helpers.ts           # (opcional) Utilitários puros internos
└── <feature>.service.test.ts      # Testes unitários do service
```

Para módulos transversais (`shared/`, `accounting/`, `policies/`) só o
service + tests é exigido.

---

## Camadas

### 1. `routes.ts` — controller fino

- **Faz**: parse do body/params, chama o service, devolve a resposta.
- **Não faz**: regras de negócio, queries Drizzle, transformações
  complexas.
- Toda rota deve usar o helper `handle()` para capturar erros de domínio
  (ver exemplo `auth.routes.ts`).
- Validação obrigatória via `validateBody(schema, req.body, res)`.

```ts
router.post(
  "/",
  authMiddleware,
  handle(async (req, res) => {
    const body = validateBody(createPatientSchema, req.body, res);
    if (!body) return;
    const patient = await patientsService.create({
      clinicId: (req as AuthRequest).user!.clinicId,
      data: body,
    });
    res.status(201).json(patient);
  }),
);
```

### 2. `service.ts` — regras de negócio

- **Faz**: orquestra repositório, valida invariantes de domínio, chama
  outros services, lança erros tipados (`AuthError`, `BillingError`…).
- **Não faz**: importa Express, lê `req`/`res`, monta SQL.
- Recebe sempre `clinicId` explícito (multi-tenant). **Nunca** confiar
  em globais.
- Exporta uma instância nomeada (`patientsService`) ou funções puras.

```ts
export const patientsService = {
  async create({ clinicId, data }: { clinicId: string; data: CreatePatientInput }) {
    if (await patientsRepository.existsByEmail(clinicId, data.email)) {
      throw new PatientsError("EMAIL_TAKEN", 409, "E-mail já cadastrado");
    }
    return patientsRepository.insert({ ...data, clinicId });
  },
};
```

### 3. `repository.ts` — acesso ao banco

- **Faz**: todas as queries Drizzle do módulo. Sempre filtra por
  `clinicId` quando aplicável.
- **Não faz**: regras de negócio, validação zod, lança erros HTTP.
- Funções puras (sem `this`). Recebem `db` por import direto de
  `@workspace/db`.

```ts
import { db, patients, eq, and } from "@workspace/db";

export const patientsRepository = {
  findById(clinicId: string, id: string) {
    return db.query.patients.findFirst({
      where: and(eq(patients.clinicId, clinicId), eq(patients.id, id)),
    });
  },
  insert(input: NewPatient) {
    return db.insert(patients).values(input).returning().then((r) => r[0]);
  },
};
```

### 4. `schemas.ts` — validação de entrada

- Schemas zod **específicos do módulo**. Reaproveitar primitives de
  `lib/api-zod` quando existir.
- Nomes no padrão: `createXSchema`, `updateXSchema`, `listXQuerySchema`.

```ts
import { z } from "zod";

export const createPatientSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
```

### 5. `*.service.test.ts` — testes unitários

- Vitest. Mockar **apenas** o repository (não o Drizzle direto).
- Cobrir: caminho feliz, erros de domínio, edge cases multi-tenant
  (clinicId errado deve retornar `null`/`404`).

---

## Módulos de referência

Use estes como exemplo ao criar/refatorar:

| Módulo | Por quê |
|---|---|
| `auth/` | Mais limpo: routes + service + repository + schemas + tests |
| `clinical/appointments/` | Caso complexo (helpers, errors, billing colateral) |
| `clinical/medical-records/` | Repositório robusto + dois arquivos de teste |
| `saas/saas-plans/` | Inclui `constants.ts` para enums de domínio |

---

## Status atual dos módulos (auditoria)

> Atualize esta tabela ao refatorar. Verde = template completo.
> Amarelo = parcial. Vermelho = só `routes.ts`.

| Módulo | routes | service | repository | schemas | tests |
|---|---|---|---|---|---|
| `auth/` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `clinical/appointments/` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `clinical/medical-records/` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `clinical/policies/` | — | ✅ | — | — | ✅ |
| `clinical/patients/` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `clinical/blocked-slots/` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `clinical/schedules/` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `clinical/patient-journey/` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `clinical/patient-photos/` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `catalog/procedures/` | ✅ | ✅ | ✅ | ✅ | — |
| `catalog/packages/` | ✅ | ❌ | ❌ | ❌ | — |
| `catalog/patient-packages/` | ✅ | ❌ | ❌ | ❌ | — |
| `catalog/treatment-plan-procedures/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/financial/` | ✅ | ✅ | ✅ | ✅ | — |
| `financial/billing/` | — | ✅ | — | — | ✅ |
| `financial/payments/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/records/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/recurring-expenses/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/reports/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/analytics/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/dashboard/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/patient-wallet/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/subscriptions/` | ✅ | ❌ | ❌ | ❌ | — |
| `financial/shared/` | — | ✅ | — | — | ✅ |
| `saas/saas-plans/` | ✅ | ✅ | ✅ | ✅ | — |
| `saas/coupons/` | ✅ | ❌ | ❌ | ❌ | — |
| `saas/subscriptions/` | ✅ | ✅ | ❌ | ❌ | ✅ |
| `admin/clinics/` | ✅ | ❌ | ❌ | ❌ | — |
| `admin/users/` | ✅ | ❌ | ❌ | ❌ | — |
| `admin/audit-log/` | ✅ | ❌ | ❌ | ❌ | — |
| `dashboard/` | ✅ | ❌ | ❌ | ❌ | — |
| `public/` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `health/` | ✅ | — | — | — | — |
| `storage/` | ✅ | — | — | — | — |
| `shared/accounting/` | — | ✅ | — | — | — |

---

## Checklist ao criar um novo módulo

- [ ] Pasta criada em `modules/<domain>/<feature>/`
- [ ] Os 4 arquivos obrigatórios (`routes`, `service`, `repository`, `schemas`)
- [ ] Pelo menos um arquivo de teste do service
- [ ] Router exportado em `modules/index.ts` com prefixo coerente
- [ ] Toda query filtra por `clinicId` (multi-tenant)
- [ ] Schemas zod nomeados no padrão `createX/updateX/listXQuery`
- [ ] Linha adicionada na tabela de status acima
