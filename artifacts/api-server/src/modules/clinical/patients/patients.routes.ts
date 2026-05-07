import { Router } from "express";
import { db } from "@workspace/db";
import {
  patientsTable,
  patientClinicsTable,
  appointmentsTable,
  financialRecordsTable,
  clinicsTable,
  subscriptionPlansTable,
} from "@workspace/db";
import { eq, ilike, or, and, sql, desc, isNull, lt, notInArray, ne } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireActiveSubscription, enforceLimit, getPlanLimits, findRequiredPlan } from "../../../middleware/subscription.js";
import { logAudit } from "../../../utils/auditLog.js";
import { parseIntParam, validateBody, validateQuery } from "../../../utils/validate.js";
import { listQuerySchema } from "../../../utils/listQuery.js";
import { buildPage, clampLimit, decodeCursor } from "../../../utils/pagination.js";
import { z } from "zod/v4";

const listPatientsQuerySchema = listQuerySchema.extend({
  search: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).max(200).optional(),
  ),
});

const birthDateField = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate deve estar no formato YYYY-MM-DD"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === "" ? null : v ?? null));

const emailField = z
  .union([z.email("E-mail inválido"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" ? null : v ?? null));

const createPatientSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().min(1, "CPF é obrigatório"),
  phone: z.string().min(1, "Telefone é obrigatório").max(30),
  birthDate: birthDateField,
  sex: z.enum(["M", "F", "O"]).optional().nullable(),
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
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let rem = (sum * 10) % 11;
  if (rem === 10 || rem === 11) rem = 0;
  if (rem !== parseInt(d[9])) return false;
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

/** Shared SELECT shape — keeps API response backward-compatible */
const patientWithClinicSelect = {
  id: patientsTable.id,
  name: patientsTable.name,
  cpf: patientsTable.cpf,
  birthDate: patientsTable.birthDate,
  sex: patientsTable.sex,
  phone: patientsTable.phone,
  email: patientsTable.email,
  address: patientsTable.address,
  profession: patientsTable.profession,
  emergencyContact: patientsTable.emergencyContact,
  notes: patientClinicsTable.notes,
  clinicId: patientClinicsTable.clinicId,
  sourcePatientId: patientsTable.sourcePatientId,
  createdAt: patientsTable.createdAt,
  deletedAt: patientsTable.deletedAt,
};

/** Checks if a patient has an active patient_clinics binding for a given clinic */
async function patientBelongsToClinic(patientId: number, clinicId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: patientClinicsTable.id })
    .from(patientClinicsTable)
    .where(
      and(
        eq(patientClinicsTable.patientId, patientId),
        eq(patientClinicsTable.clinicId, clinicId),
        isNull(patientClinicsTable.deletedAt),
      ),
    )
    .limit(1);
  return !!row;
}

router.get("/", requirePermission("patients.read"), async (req: AuthRequest, res): Promise<void> => {
  try {
    const q = validateQuery(listPatientsQuerySchema, req.query, res);
    if (!q) return;

    const search = q.q ?? q.search;
    const limit = clampLimit(q.limit);
    const cursor = decodeCursor(q.cursor);

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

    const cursorCondition = cursor
      ? or(
          lt(patientsTable.createdAt, new Date(cursor.v as string)),
          and(
            eq(patientsTable.createdAt, new Date(cursor.v as string)),
            lt(patientsTable.id, cursor.id),
          ),
        )
      : null;

    if (req.clinicId) {
      const clinicJoin = and(
        eq(patientClinicsTable.patientId, patientsTable.id),
        eq(patientClinicsTable.clinicId, req.clinicId),
        isNull(patientClinicsTable.deletedAt),
      );
      const baseWhere = and(
        isNull(patientsTable.deletedAt),
        searchCondition ?? undefined,
      );
      const fullWhere = and(baseWhere, cursorCondition ?? undefined);

      const [rows, countResult] = await Promise.all([
        db
          .select(patientWithClinicSelect)
          .from(patientsTable)
          .innerJoin(patientClinicsTable, clinicJoin)
          .where(fullWhere)
          .orderBy(desc(patientsTable.createdAt), desc(patientsTable.id))
          .limit(limit + 1),
        cursor
          ? Promise.resolve(null)
          : db
              .select({ count: sql<number>`count(*)` })
              .from(patientClinicsTable)
              .where(and(
                eq(patientClinicsTable.clinicId, req.clinicId),
                isNull(patientClinicsTable.deletedAt),
              )),
      ]);

      const total = countResult ? Number(countResult[0]?.count ?? 0) : undefined;
      const result = buildPage(
        rows,
        limit,
        (row) => ({ v: row.createdAt!.toISOString(), id: row.id }),
        total,
      );
      res.json(result);
      return;
    }

    // Superadmin path — no clinic filter
    const baseWhere = and(isNull(patientsTable.deletedAt), searchCondition ?? undefined);
    const fullWhere = and(baseWhere, cursorCondition ?? undefined);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(patientsTable)
        .where(fullWhere)
        .orderBy(desc(patientsTable.createdAt), desc(patientsTable.id))
        .limit(limit + 1),
      cursor
        ? Promise.resolve(null)
        : db
            .select({ count: sql<number>`count(*)` })
            .from(patientsTable)
            .where(and(isNull(patientsTable.deletedAt), searchCondition ?? undefined)),
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

router.post("/", requirePermission("patients.create"), async (req: AuthRequest, res) => {
  try {
    const parsed = validateBody(createPatientSchema, req.body, res);
    if (!parsed) return;
    const { name, cpf, birthDate, sex, phone, email, address, profession, emergencyContact, notes } = parsed;

    const normalizedCpf = normalizeCpf(cpf);
    if (!validateCpf(normalizedCpf)) {
      res.status(400).json({ error: "Bad Request", message: "CPF inválido. Verifique os dígitos informados." });
      return;
    }

    // ── 1. Cross-clinic CPF check — always runs first, before limit enforcement ──
    if (req.clinicId) {
      const existingGlobal = await db
        .select({
          id: patientsTable.id,
          name: patientsTable.name,
          phone: patientsTable.phone,
          email: patientsTable.email,
          birthDate: patientsTable.birthDate,
          cpf: patientsTable.cpf,
          address: patientsTable.address,
          profession: patientsTable.profession,
          emergencyContact: patientsTable.emergencyContact,
        })
        .from(patientsTable)
        .where(and(eq(patientsTable.cpf, normalizedCpf), isNull(patientsTable.deletedAt)))
        .limit(1);

      if (existingGlobal.length > 0) {
        const existing = existingGlobal[0]!;
        const alreadyInClinic = await patientBelongsToClinic(existing.id, req.clinicId);
        if (alreadyInClinic) {
          res.status(409).json({ error: "Conflict", message: "CPF já cadastrado nesta clínica" });
          return;
        }

        // CPF exists in another clinic — find source clinic
        const [sourceBinding] = await db
          .select({ clinicId: patientClinicsTable.clinicId })
          .from(patientClinicsTable)
          .where(and(
            eq(patientClinicsTable.patientId, existing.id),
            isNull(patientClinicsTable.deletedAt),
          ))
          .orderBy(patientClinicsTable.createdAt)
          .limit(1);

        const sourceClinicName = sourceBinding?.clinicId
          ? (await db.select({ name: clinicsTable.name }).from(clinicsTable).where(eq(clinicsTable.id, sourceBinding.clinicId)).limit(1))[0]?.name
          : null;

        res.status(409).json({
          error: "Conflict",
          code: "CPF_EXISTS_OTHER_CLINIC",
          message: "Este CPF já está cadastrado em outra clínica.",
          patient: {
            id: existing.id,
            name: existing.name,
            phone: existing.phone,
            email: existing.email,
            birthDate: existing.birthDate,
            cpf: existing.cpf,
            address: existing.address,
            profession: existing.profession,
            emergencyContact: existing.emergencyContact,
          },
          sourceClinic: sourceClinicName ?? "outra clínica",
        });
        return;
      }

      // ── 2. Inline limit enforcement (only for truly new CPF) ──
      const sub = req.subscriptionInfo ?? await getPlanLimits(req.clinicId);
      if (sub && sub.maxPatients != null) {
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(patientClinicsTable)
          .where(and(
            eq(patientClinicsTable.clinicId, req.clinicId),
            isNull(patientClinicsTable.deletedAt),
          ));
        const current = Number(total);
        if (current >= sub.maxPatients) {
          const [planRow] = await db
            .select({ price: subscriptionPlansTable.price, displayName: subscriptionPlansTable.displayName })
            .from(subscriptionPlansTable)
            .where(eq(subscriptionPlansTable.id, sub.planId))
            .limit(1);
          const priceCents = planRow ? Math.round(Number(planRow.price) * 100) : 0;
          const required = await findRequiredPlan("patients", current, priceCents);
          res.status(402).json({
            error: "Plan Limit Reached",
            limitReached: true,
            resource: "patients",
            limit: sub.maxPatients,
            current,
            planName: sub.planName,
            planDisplayName: planRow?.displayName ?? sub.planName,
            requiredPlan: required
              ? { name: required.name, displayName: required.displayName, price: required.price, limit: required.maxPatients }
              : null,
            message: `Você atingiu o limite de ${sub.maxPatients} paciente${sub.maxPatients === 1 ? "" : "s"} do plano ${planRow?.displayName ?? sub.planName}.`,
          });
          return;
        }
      }
    }

    // ── 3. Create global patient + clinic binding in one transaction ──
    const result = await db.transaction(async (tx) => {
      const [patient] = await tx
        .insert(patientsTable)
        .values({
          name,
          cpf: normalizedCpf,
          birthDate: birthDate || null,
          sex: sex || null,
          phone,
          email: email || null,
          address: address || null,
          profession: profession || null,
          emergencyContact: emergencyContact || null,
          notes: notes || null,
          clinicId: req.clinicId ?? null,
        })
        .returning();

      let binding = null;
      if (req.clinicId && patient) {
        [binding] = await tx
          .insert(patientClinicsTable)
          .values({
            patientId: patient.id,
            clinicId: req.clinicId,
            notes: notes || null,
          })
          .returning();
      }

      return { patient, binding };
    });

    await logAudit({
      userId: req.userId,
      patientId: result.patient?.id,
      action: "create",
      entityType: "patient",
      entityId: result.patient?.id,
      summary: `Paciente cadastrado: ${name}`,
    });

    res.status(201).json({
      ...result.patient,
      clinicId: result.binding?.clinicId ?? result.patient?.clinicId ?? null,
      notes: result.binding?.notes ?? result.patient?.notes ?? null,
    });
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "Conflict", message: "CPF já cadastrado nesta clínica" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /api/patients/import-by-cpf
 * No novo modelo global: o paciente já existe como registro único.
 * Apenas cria o vínculo patient_clinics para a clínica atual.
 */
router.post("/import-by-cpf", requirePermission("patients.create"), enforceLimit("patients"), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      cpf: z.string().min(1),
      notes: z.string().max(2000).optional().nullable(),
    });
    const parsed = validateBody(schema, req.body, res);
    if (!parsed) return;

    const normalizedCpf = normalizeCpf(parsed.cpf);
    if (!validateCpf(normalizedCpf)) {
      res.status(400).json({ error: "Bad Request", message: "CPF inválido." });
      return;
    }

    if (!req.clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada." });
      return;
    }

    // Find global patient
    const [globalPatient] = await db
      .select()
      .from(patientsTable)
      .where(and(eq(patientsTable.cpf, normalizedCpf), isNull(patientsTable.deletedAt)))
      .limit(1);

    if (!globalPatient) {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado em nenhuma clínica." });
      return;
    }

    // Check if already in this clinic
    const alreadyBound = await patientBelongsToClinic(globalPatient.id, req.clinicId);
    if (alreadyBound) {
      res.status(409).json({ error: "Conflict", message: "Paciente já cadastrado nesta clínica." });
      return;
    }

    // Create clinic binding
    const [binding] = await db
      .insert(patientClinicsTable)
      .values({
        patientId: globalPatient.id,
        clinicId: req.clinicId,
        notes: parsed.notes || null,
      })
      .returning();

    await logAudit({
      userId: req.userId,
      patientId: globalPatient.id,
      action: "create",
      entityType: "patient",
      entityId: globalPatient.id,
      summary: `Paciente vinculado de outra clínica: ${globalPatient.name}`,
    });

    res.status(201).json({
      ...globalPatient,
      clinicId: binding.clinicId,
      notes: binding.notes ?? globalPatient.notes,
    });
  } catch (err: any) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "Conflict", message: "Paciente já cadastrado nesta clínica." });
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

    let patient: any;
    if (req.clinicId) {
      const [row] = await db
        .select(patientWithClinicSelect)
        .from(patientsTable)
        .innerJoin(
          patientClinicsTable,
          and(
            eq(patientClinicsTable.patientId, patientsTable.id),
            eq(patientClinicsTable.clinicId, req.clinicId),
            isNull(patientClinicsTable.deletedAt),
          ),
        )
        .where(and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt)));
      patient = row ?? null;
    } else {
      const [row] = await db
        .select()
        .from(patientsTable)
        .where(and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt)));
      patient = row ?? null;
    }

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
        .where(
          and(
            eq(financialRecordsTable.patientId, id),
            eq(financialRecordsTable.type, "receita"),
            ne(financialRecordsTable.status, "estornado"),
            notInArray(financialRecordsTable.transactionType, [
              "usoCarteira",
              "usoCredito",
              "creditoSessao",
              "creditoAReceber",
              // debitoServico é um recebível (paciente deve à clínica).
              // Quando quitado, um registro `pagamento` é criado — ele entra em
              // totalSpent. Incluir debitoServico aqui evitaria dupla contagem.
              "debitoServico",
            ]),
          ),
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
    const { name, birthDate, sex, phone, email, address, profession, emergencyContact, notes } = parsed;
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

    // Verify clinic membership
    if (req.clinicId) {
      const belongs = await patientBelongsToClinic(id, req.clinicId);
      if (!belongs) {
        res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
        return;
      }
    } else {
      const [existing] = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt)));
      if (!existing) {
        res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
        return;
      }
    }

    // Update global patient demographics + per-clinic notes in one transaction
    const patient = await db.transaction(async (tx) => {
      const demographicSet: Record<string, any> = {};
      if (name !== undefined) demographicSet.name = name;
      if (cpf !== undefined) demographicSet.cpf = cpf;
      if (birthDate !== undefined) demographicSet.birthDate = birthDate || null;
      if (sex !== undefined) demographicSet.sex = sex || null;
      if (phone !== undefined) demographicSet.phone = phone;
      if (email !== undefined) demographicSet.email = email || null;
      if (address !== undefined) demographicSet.address = address || null;
      if (profession !== undefined) demographicSet.profession = profession || null;
      if (emergencyContact !== undefined) demographicSet.emergencyContact = emergencyContact || null;

      let updated: any = null;
      if (Object.keys(demographicSet).length > 0) {
        const [u] = await tx
          .update(patientsTable)
          .set(demographicSet)
          .where(and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt)))
          .returning();
        updated = u ?? null;
      } else {
        const [u] = await tx
          .select()
          .from(patientsTable)
          .where(and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt)));
        updated = u ?? null;
      }

      if (!updated) return null;

      // Update per-clinic notes if notes field was provided and we have a clinic context
      let bindingNotes: string | null = null;
      if (notes !== undefined && req.clinicId) {
        const [binding] = await tx
          .update(patientClinicsTable)
          .set({ notes: notes || null })
          .where(and(
            eq(patientClinicsTable.patientId, id),
            eq(patientClinicsTable.clinicId, req.clinicId),
            isNull(patientClinicsTable.deletedAt),
          ))
          .returning({ notes: patientClinicsTable.notes, clinicId: patientClinicsTable.clinicId });
        bindingNotes = binding?.notes ?? null;
        return { ...updated, clinicId: binding?.clinicId ?? req.clinicId, notes: bindingNotes };
      }

      return { ...updated, clinicId: req.clinicId ?? updated.clinicId, notes: updated.notes };
    });

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

    if (req.clinicId) {
      // Clinic user: soft-delete only the patient_clinics binding
      const [binding] = await db
        .select({
          bindingId: patientClinicsTable.id,
          patientName: patientsTable.name,
        })
        .from(patientClinicsTable)
        .innerJoin(patientsTable, eq(patientClinicsTable.patientId, patientsTable.id))
        .where(and(
          eq(patientClinicsTable.patientId, id),
          eq(patientClinicsTable.clinicId, req.clinicId),
          isNull(patientClinicsTable.deletedAt),
        ));

      if (!binding) {
        res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
        return;
      }

      await db
        .update(patientClinicsTable)
        .set({ deletedAt: new Date() })
        .where(eq(patientClinicsTable.id, binding.bindingId));

      await logAudit({
        userId: req.userId,
        patientId: null,
        action: "delete",
        entityType: "patient",
        entityId: id,
        summary: `Vínculo de paciente removido da clínica: ${binding.patientName ?? `ID ${id}`}`,
      });
    } else {
      // Superadmin: soft-delete global patient record
      const [existing] = await db
        .select({ name: patientsTable.name })
        .from(patientsTable)
        .where(and(eq(patientsTable.id, id), isNull(patientsTable.deletedAt)));

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
        summary: `Paciente global excluído: ${existing.name ?? `ID ${id}`}`,
      });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
