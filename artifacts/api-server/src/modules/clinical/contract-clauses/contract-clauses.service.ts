/**
 * Sprint Financeiro 11 (P5) — service de cláusulas contratuais por clínica.
 *
 * Regras:
 *   • Listagem (`list`) devolve apenas as cláusulas ativas da clínica para uso
 *     no aceite. O CRUD admin pode pedir `includeInactive=true` para ver
 *     histórico de versões.
 *   • Criar uma nova cláusula com `code` já existente automaticamente
 *     incrementa a versão e desativa as versões anteriores (transação).
 *   • Update permite alterar apenas metadados leves (title, isRequired,
 *     sortOrder, isActive). Para alterar o `body`, o cliente deve POSTar
 *     uma nova versão.
 *   • Delete físico só permitido quando a cláusula NUNCA foi referenciada em
 *     `treatment_plans.accepted_clauses_json`. Caso contrário o service marca
 *     `is_active=false` (soft delete) para preservar o histórico probatório.
 *
 * Helpers exportados também são usados pelo aceite do plano para validar e
 * congelar o snapshot.
 */
import { db } from "@workspace/db";
import { clinicContractClausesTable, type ClinicContractClause } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { HttpError } from "../../../utils/httpError.js";

export interface ClauseInput {
  code: string;
  title: string;
  body: string;
  isRequired?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ClauseUpdateInput {
  title?: string;
  isRequired?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface AcceptedClauseSnapshotItem {
  id: number;
  code: string;
  version: number;
  title: string;
  body: string;
  isRequired: boolean;
}

export interface AcceptedClausesSnapshot {
  capturedAt: string;
  items: AcceptedClauseSnapshotItem[];
}

const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function assertCode(code: string) {
  if (!CODE_RE.test(code)) {
    throw HttpError.badRequest(
      "Código inválido — use apenas A-Z, 0-9 e _ (2 a 64 chars).",
    );
  }
}

/**
 * Lista cláusulas da clínica.
 *  - `activeOnly=true` (default): só `isActive=true` (uso no aceite).
 *  - `activeOnly=false`: histórico completo (uso na tela de admin).
 */
export async function listClauses(
  clinicId: number,
  opts: { activeOnly?: boolean } = {},
): Promise<ClinicContractClause[]> {
  const activeOnly = opts.activeOnly ?? true;
  const where = activeOnly
    ? and(eq(clinicContractClausesTable.clinicId, clinicId), eq(clinicContractClausesTable.isActive, true))
    : eq(clinicContractClausesTable.clinicId, clinicId);
  return db
    .select()
    .from(clinicContractClausesTable)
    .where(where)
    .orderBy(asc(clinicContractClausesTable.sortOrder), asc(clinicContractClausesTable.code), asc(clinicContractClausesTable.version));
}

/**
 * Cria uma nova cláusula. Se já houver versões anteriores com o mesmo `code`
 * na clínica, a nova versão recebe `version = max(prev) + 1` e as anteriores
 * são desativadas — em transação.
 */
export async function createClause(
  clinicId: number,
  input: ClauseInput,
): Promise<ClinicContractClause> {
  const code = normalizeCode(input.code);
  assertCode(code);
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw HttpError.badRequest("Título obrigatório.");
  if (!body) throw HttpError.badRequest("Corpo da cláusula obrigatório.");

  return db.transaction(async (tx) => {
    const previous = await tx
      .select({
        id: clinicContractClausesTable.id,
        version: clinicContractClausesTable.version,
      })
      .from(clinicContractClausesTable)
      .where(
        and(
          eq(clinicContractClausesTable.clinicId, clinicId),
          eq(clinicContractClausesTable.code, code),
        ),
      );

    const nextVersion = previous.reduce((max, row) => Math.max(max, row.version), 0) + 1;

    if (previous.length > 0) {
      await tx
        .update(clinicContractClausesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(clinicContractClausesTable.clinicId, clinicId),
            eq(clinicContractClausesTable.code, code),
          ),
        );
    }

    const [created] = await tx
      .insert(clinicContractClausesTable)
      .values({
        clinicId,
        code,
        title,
        body,
        version: nextVersion,
        isRequired: input.isRequired ?? false,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return created;
  });
}

/**
 * Atualiza apenas metadados leves. Para alterar `body`, use POST (cria nova
 * versão).
 */
export async function updateClause(
  clinicId: number,
  id: number,
  input: ClauseUpdateInput,
): Promise<ClinicContractClause> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) throw HttpError.badRequest("Título não pode ser vazio.");
    patch.title = t;
  }
  if (input.isRequired !== undefined) patch.isRequired = !!input.isRequired;
  if (input.isActive !== undefined) patch.isActive = !!input.isActive;
  if (input.sortOrder !== undefined) patch.sortOrder = Math.trunc(input.sortOrder);

  const [updated] = await db
    .update(clinicContractClausesTable)
    .set(patch)
    .where(
      and(
        eq(clinicContractClausesTable.id, id),
        eq(clinicContractClausesTable.clinicId, clinicId),
      ),
    )
    .returning();

  if (!updated) throw HttpError.notFound("Cláusula não encontrada.");
  return updated;
}

/**
 * Soft delete: marca `is_active=false`. Cláusulas referenciadas em algum aceite
 * não podem ser apagadas fisicamente (preserva histórico LGPD/CPC).
 */
export async function deleteClause(clinicId: number, id: number): Promise<{ deleted: boolean; deactivated: boolean }> {
  const [clause] = await db
    .select()
    .from(clinicContractClausesTable)
    .where(and(eq(clinicContractClausesTable.id, id), eq(clinicContractClausesTable.clinicId, clinicId)));
  if (!clause) throw HttpError.notFound("Cláusula não encontrada.");

  const used = await isClauseInUse(clinicId, clause.code, clause.version);
  if (used) {
    if (clause.isActive) {
      await db
        .update(clinicContractClausesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(clinicContractClausesTable.id, id));
    }
    return { deleted: false, deactivated: true };
  }

  await db.delete(clinicContractClausesTable).where(eq(clinicContractClausesTable.id, id));
  return { deleted: true, deactivated: false };
}

/**
 * Retorna `true` se algum `treatment_plans.accepted_clauses_json` referencia a
 * tupla (code, version). Implementação via JSONB-ish search em texto:
 * usamos `accepted_clauses_json LIKE '%"code":"<code>"%' AND ... '%"version":<v>%'`
 * para evitar ter que materializar o snapshot — barato em escala normal.
 */
async function isClauseInUse(clinicId: number, code: string, version: number): Promise<boolean> {
  const codeFragment = `"code":"${code.replace(/"/g, '\\"')}"`;
  const versionFragment = `"version":${version}`;
  const result = await db.execute(
    sql`
      SELECT 1
      FROM treatment_plans tp
      JOIN patients pa ON pa.id = tp.patient_id
      WHERE pa.clinic_id = ${clinicId}
        AND tp.accepted_clauses_json IS NOT NULL
        AND tp.accepted_clauses_json LIKE ${"%" + codeFragment + "%"}
        AND tp.accepted_clauses_json LIKE ${"%" + versionFragment + "%"}
      LIMIT 1
    `,
  );
  const rows = (result as unknown as { rows?: unknown[] }).rows ?? (Array.isArray(result) ? result : []);
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Valida e congela o snapshot das cláusulas a serem aceitas.
 *
 * Regras:
 *   • Cada `acceptedCodes[i]` precisa corresponder a uma cláusula `is_active=true`
 *     da clínica. Códigos desconhecidos → 400.
 *   • TODA cláusula `is_required=true` da clínica deve estar em `acceptedCodes`,
 *     sob pena de 400 ("clause_required_missing").
 *   • Devolve um snapshot serializável (JSON) com a versão exata aceita.
 */
export async function buildAcceptedClausesSnapshot(
  clinicId: number,
  acceptedCodes: string[],
): Promise<{ snapshot: AcceptedClausesSnapshot | null; missingRequired: string[] }> {
  const active = await listClauses(clinicId, { activeOnly: true });
  if (active.length === 0) {
    // Nenhuma cláusula configurada — o aceite procede normalmente sem snapshot.
    return { snapshot: null, missingRequired: [] };
  }

  const normalized = Array.from(new Set(acceptedCodes.map((c) => normalizeCode(c))));
  const byCode = new Map(active.map((c) => [c.code, c]));

  // Códigos desconhecidos
  for (const code of normalized) {
    if (!byCode.has(code)) {
      throw HttpError.badRequest(`Cláusula desconhecida ou inativa: ${code}`);
    }
  }

  const missingRequired = active
    .filter((c) => c.isRequired && !normalized.includes(c.code))
    .map((c) => c.code);

  if (missingRequired.length > 0) {
    return { snapshot: null, missingRequired };
  }

  const items: AcceptedClauseSnapshotItem[] = normalized.map((code) => {
    const c = byCode.get(code)!;
    return {
      id: c.id,
      code: c.code,
      version: c.version,
      title: c.title,
      body: c.body,
      isRequired: c.isRequired,
    };
  });

  return {
    snapshot: { capturedAt: new Date().toISOString(), items },
    missingRequired: [],
  };
}

/**
 * Seed idempotente: insere as 3 cláusulas-padrão se a clínica ainda não tiver
 * NENHUMA cláusula configurada. Evita conflito com clínicas que já editaram
 * suas cláusulas manualmente.
 */
export const DEFAULT_CLAUSES: ClauseInput[] = [
  {
    code: "REAGENDAMENTO_INTRAMENSAL",
    title: "Reagendamento dentro do mês",
    body:
      "As sessões mensais devem ser realizadas dentro do mês de competência. " +
      "Faltas sem reagendamento dentro do próprio mês não geram crédito futuro " +
      "nem reembolso, ficando o valor mensal contratado integralmente devido.",
    isRequired: true,
    sortOrder: 10,
  },
  {
    code: "PRECO_DIFERENCIADO",
    title: "Preço diferenciado em itens avulsos do plano",
    body:
      "Eventuais procedimentos avulsos contratados dentro do plano podem ter " +
      "preço inferior ao da tabela em troca do compromisso de continuidade. " +
      "Em caso de rompimento antecipado, a clínica fica autorizada a recalcular " +
      "as sessões já realizadas pelo preço de tabela e cobrar a diferença.",
    isRequired: true,
    sortOrder: 20,
  },
  {
    code: "TITULO_EXECUTIVO",
    title: "Constituição como título executivo extrajudicial",
    body:
      "O presente aceite, somado à trilha probatória LGPD (assinatura, IP e " +
      "dispositivo) e ao snapshot dos preços vigentes, constitui título " +
      "executivo extrajudicial nos termos do art. 784, III, do Código de " +
      "Processo Civil, conferindo à clínica o direito de cobrar judicialmente " +
      "as parcelas vencidas e não pagas.",
    isRequired: true,
    sortOrder: 30,
  },
];

export async function seedDefaultClauses(clinicId: number): Promise<{ created: number }> {
  const existing = await db
    .select({ id: clinicContractClausesTable.id })
    .from(clinicContractClausesTable)
    .where(eq(clinicContractClausesTable.clinicId, clinicId))
    .limit(1);
  if (existing.length > 0) return { created: 0 };

  let created = 0;
  for (const c of DEFAULT_CLAUSES) {
    await createClause(clinicId, c);
    created++;
  }
  return { created };
}
