import { Router } from "express";
import { db } from "@workspace/db";
import { patientsTable, appointmentsTable, financialRecordsTable } from "@workspace/db";
import { eq, ilike, or, and, sql, desc, isNull, lt } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireActiveSubscription, enforceLimit } from "../../../middleware/subscription.js";
import { logAudit } from "../../../utils/auditLog.js";
import { parseIntParam, validateBody, validateQuery } from "../../../utils/validate.js";
import { listQuerySchema } from "../../../utils/listQuery.js";
import { buildPage, clampLimit, decodeCursor } from "../../../utils/pagination.js";
import { z } from "zod/v4";

const listPatientsQuerySchema = listQuerySchema.extend({
  /** Compat: o frontend ainda usa `?search=` no lugar de `?q=`. */
  search: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).max(200).optional(),
  ),
});

// Accepts a valid YYYY-MM-DD string, an empty string (treated as null), or null/undefined.
const birthDateField = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate deve estar no formato YYYY-MM-DD"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === "" ? null : v ?? null));

// Accepts a valid e-mail, an empty string (treated as null), or null/undefined.
const emailField = z
  .union([z.email("E-mail inválido"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v ?? null));

const createPatientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().min(1, "CPF é obrigatório"),
  phone: z.string().min(1, "Telefone é obrigatório").max(30),
  birthDate: birthDateField,
  email: emailField,
  address: z.string().max(500).optional().nullable(),
  profession: z.string().max(200).optional().nullable(),
  emergencyContact: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updatePatientSchema = createPatientSchema.partial();

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

function validateCpf(cpf: string): boolean {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return false;
  // Reject all-same-digit sequences (000...000, 111...111, etc.)
  if (/^(\d)\1{10}$/.test(d)) return false;
  // First check digit
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(d[9])) return false;
  // Second check digit
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(d[10])) return false;
  return true;
}

function isDuplicateKeyError(err: any): boolean {
  return err?.code === "23505" || err?.cause?.code === "23505";
}

const router = Router();
router.use(authMiddleware);
router.use(requireActiveSubscription());

function clinicFilter(req: AuthRequest) {
  if (req.isSuperAdmin || !req.clinicId) return isNull(patientsTable.deletedAt);
  return and(eq(patientsTable.clinicId, req.clinicId), isNull(patientsTable.deletedAt));
}

router.get("/", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    const q = validateQuery(listPatientsQuerySchema, req.query, res);
    if (!q) return;

    const search = q.q ?? q.search;
    const limit = clampLimit(q.limit);
    const cursor = decodeCursor(q.cursor);

    const clinicCondition = clinicFilter(req);
    const normalizedSearch = search ? normalizeCpf(search) : null;
    const cpfDiffersFromSearch = normalizedSearch && normalizedSearch !== search && normalizedSearch.length >= 3;
    const searchCondition = search
      ? or(
          ilike(patientsTable.name, `%${search}%`),
          ilike(patientsTable.cpf, `%${search}%`),
          cpfDiffersFromSearch
            ? ilike(patientsTable.cpf, `%${normalizedSearch}%`)
            : undefined,
          ilike(patientsTable.phone, `%${search}%`),
        )
      : null;

    // Paginação cursor: ordenamos por createdAt desc, id desc (desempate).
    // Cursor carrega o createdAt ISO da última linha + id.
    const cursorCondition = cursor
      ? or(
          lt(patientsTable.createdAt, new Date(cursor.v as string)),
          and(
            eq(patientsTable.createdAt, new Date(cursor.v as string)),
            lt(patientsTable.id, cursor.id),
          ),
        )
      : null;

    const filters = [clinicCondition, searchCondition].filter(Boolean) as any[];
    const whereCondition = and(...filters, ...(cursorCondition ? [cursorCondition] : []));
    const countWhere = filters.length > 0 ? and(...filters) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(patientsTable)
        .where(whereCondition)
        .orderBy(desc(patientsTable.createdAt), desc(patientsTable.id))
        .limit(limit + 1),
      // Total só na primeira página (sem cursor) — evita custo em scroll infinito.
      cursor
        ? Promise.resolve(null)
        : db.select({ count: sql<number>`count(*)` }).from(patientsTable).where(countWhere),
    ]);

    const total = countResult ? Number(countResult[0]?.count ?? 0) : undefined;
    const result = buildPage(
      rows,
      limit,
      (row) => ({ v: row.createdAt!.toISOString(), id: row.id }),
      total,
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requirePermission("patients.create"), enforceLimit("patients"), async (req: AuthRequest, res) => {
  try {
    const parsed = validateBody(createPatientSchema, req.body, res);
    if (!parsed) return;
    const { name, cpf, birthDate, phone, email, address, profession, emergencyContact, notes } = parsed;

    const normalizedCpf = normalizeCpf(cpf);
    if (!validateCpf(normalizedCpf)) {
      res.status(400).json({ error: "Bad Request", message: "CPF inválido. Verifique os dígitos informados." });
      return;
    }

    const [patient] = await db
      .insert(patientsTable)
      .values({
        name,
        cpf: normalizedCpf,
        birthDate: birthDate || null,
        phone,
        email: email || null,
        address: address || null,
        profession: profession || null,
        emergencyContact: emergencyContact || null,
        notes: notes || null,
        clinicId: req.clinicId ?? null,
      })
      .returning();

    await logAudit({
      userId: req.userId,
      patientId: patient?.id,
      action: "create",
      entityType: "patient",
      entityId: patient?.id,
      summary: `Paciente cadastrado: ${name}`,
    });
    res.status(201).json(patient);
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "Conflict", message: "CPF já cadastrado" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do paciente");
    if (id === null) return;
    const condition = req.isSuperAdmin || !req.clinicId
      ? and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt))
      : and(eq(patientsTable.id, id), eq(patientsTable.clinicId, req.clinicId!), isNull(patientsTable.deletedAt));

    const [patient] = await db
      .select()
      .from(patientsTable)
      .where(condition);

    if (!patient) {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
      return;
    }

    const [appointments, totalSpent] = await Promise.all([
      db
        .select({ id: appointmentsTable.id, date: appointmentsTable.date, createdAt: appointmentsTable.createdAt })
        .from(appointmentsTable)
        .where(eq(appointmentsTable.patientId, id))
        .orderBy(desc(appointmentsTable.date)),
      db
        .select({ total: sql<number>`COALESCE(SUM(${financialRecordsTable.amount}::numeric), 0)` })
        .from(financialRecordsTable)
        .leftJoin(appointmentsTable, eq(financialRecordsTable.appointmentId, appointmentsTable.id))
        .where(
          and(
            eq(financialRecordsTable.type, "receita"),
            or(
              eq(financialRecordsTable.patientId, id),
              eq(appointmentsTable.patientId, id)
            )
          )
        ),
    ]);

    res.json({
      ...patient,
      totalAppointments: appointments.length,
      lastAppointment: appointments[0]?.date ?? null,
      totalSpent: Number(totalSpent[0]?.total ?? 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("patients.update"), async (req: AuthRequest, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do paciente");
    if (id === null) return;
    const parsed = validateBody(updatePatientSchema, req.body, res);
    if (!parsed) return;
    const { name, birthDate, phone, email, address, profession, emergencyContact, notes } = parsed;
    let cpf = parsed.cpf;

    if (cpf !== undefined) {
      if (!cpf || !cpf.trim()) {
        res.status(400).json({ error: "Bad Request", message: "CPF não pode estar em branco" });
        return;
      }
      const normalizedCpf = normalizeCpf(cpf);
      if (!validateCpf(normalizedCpf)) {
        res.status(400).json({ error: "Bad Request", message: "CPF inválido. Verifique os dígitos informados." });
        return;
      }
      cpf = normalizedCpf;
    }

    const condition = req.isSuperAdmin || !req.clinicId
      ? and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt))
      : and(eq(patientsTable.id, id), eq(patientsTable.clinicId, req.clinicId!), isNull(patientsTable.deletedAt));

    const [patient] = await db
      .update(patientsTable)
      .set({
        name,
        cpf,
        birthDate: birthDate !== undefined ? (birthDate || null) : undefined,
        phone,
        email: email !== undefined ? (email || null) : undefined,
        address: address !== undefined ? (address || null) : undefined,
        profession: profession !== undefined ? (profession || null) : undefined,
        emergencyContact: emergencyContact !== undefined ? (emergencyContact || null) : undefined,
        notes: notes !== undefined ? (notes || null) : undefined,
      })
      .where(condition)
      .returning();

    if (!patient) {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
      return;
    }
    await logAudit({
      userId: req.userId,
      patientId: id,
      action: "update",
      entityType: "patient",
      entityId: id,
      summary: `Dados cadastrais do paciente atualizados`,
    });
    res.json(patient);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("patients.delete"), async (req: AuthRequest, res) => {
  try {
    const id = parseIntParam(req.params.id, res, "ID do paciente");
    if (id === null) return;

    const condition = req.isSuperAdmin || !req.clinicId
      ? and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt))
      : and(eq(patientsTable.id, id), eq(patientsTable.clinicId, req.clinicId!), isNull(patientsTable.deletedAt));

    const [existing] = await db
      .select({ name: patientsTable.name })
      .from(patientsTable)
      .where(condition);

    if (!existing) {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
      return;
    }

    await db
      .update(patientsTable)
      .set({ deletedAt: new Date() })
      .where(eq(patientsTable.id, id));

    await logAudit({
      userId: req.userId,
      patientId: null,
      action: "delete",
      entityType: "patient",
      entityId: id,
      summary: `Paciente excluído: ${existing?.name ?? `ID ${id}`}`,
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
