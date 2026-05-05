import { Router } from "express";
import { db } from "@workspace/db";
import { patientAccessRequestsTable, patientsTable, patientClinicsTable, clinicsTable } from "@workspace/db";
import { eq, and, desc, isNull } from "drizzle-orm";
import { authMiddleware, type AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireActiveSubscription } from "../../../middleware/subscription.js";
import { validateBody } from "../../../utils/validate.js";
import { z } from "zod/v4";

const router = Router();
router.use(authMiddleware);
router.use(requireActiveSubscription());

/**
 * POST /api/patients/access-requests
 * Solicita acesso a dados clínicos de um paciente cadastrado em outra clínica.
 */
router.post("/access-requests", requirePermission("patients.create"), async (req: AuthRequest, res) => {
  try {
    const schema = z.object({
      cpf: z.string().min(1),
      message: z.string().max(500).optional(),
    });
    const parsed = validateBody(schema, req.body, res);
    if (!parsed) return;

    if (!req.clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada." });
      return;
    }

    const normalizedCpf = parsed.cpf.replace(/\D/g, "");

    // Encontrar a clínica de origem (primeiro vínculo do paciente via patient_clinics)
    const [sourceBinding] = await db
      .select({ clinicId: patientClinicsTable.clinicId })
      .from(patientClinicsTable)
      .innerJoin(patientsTable, eq(patientClinicsTable.patientId, patientsTable.id))
      .where(and(
        eq(patientsTable.cpf, normalizedCpf),
        isNull(patientsTable.deletedAt),
        isNull(patientClinicsTable.deletedAt),
      ))
      .orderBy(patientClinicsTable.createdAt)
      .limit(1);

    if (!sourceBinding?.clinicId) {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado." });
      return;
    }

    if (sourceBinding.clinicId === req.clinicId) {
      res.status(400).json({ error: "Bad Request", message: "O paciente já pertence a esta clínica." });
      return;
    }

    // Upsert: se já existe uma solicitação pendente/aprovada, retornar a existente
    const existing = await db
      .select()
      .from(patientAccessRequestsTable)
      .where(and(
        eq(patientAccessRequestsTable.cpf, normalizedCpf),
        eq(patientAccessRequestsTable.requestingClinicId, req.clinicId),
      ))
      .limit(1);

    if (existing.length > 0) {
      res.status(200).json(existing[0]);
      return;
    }

    const [request] = await db
      .insert(patientAccessRequestsTable)
      .values({
        cpf: normalizedCpf,
        requestingClinicId: req.clinicId,
        sourceClinicId: sourceBinding.clinicId,
        message: parsed.message ?? null,
        status: "pending",
        scope: "clinical_records",
      })
      .returning();

    res.status(201).json(request);
  } catch (err: any) {
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      res.status(409).json({ error: "Conflict", message: "Solicitação já enviada para este paciente." });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /api/patients/access-requests/incoming
 * Lista as solicitações recebidas pela clínica atual (como clínica de origem).
 */
router.get("/access-requests/incoming", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId) {
      res.json([]);
      return;
    }

    const requests = await db
      .select({
        id: patientAccessRequestsTable.id,
        cpf: patientAccessRequestsTable.cpf,
        status: patientAccessRequestsTable.status,
        scope: patientAccessRequestsTable.scope,
        message: patientAccessRequestsTable.message,
        respondedAt: patientAccessRequestsTable.respondedAt,
        createdAt: patientAccessRequestsTable.createdAt,
        requestingClinicId: patientAccessRequestsTable.requestingClinicId,
        requestingClinicName: clinicsTable.name,
      })
      .from(patientAccessRequestsTable)
      .leftJoin(clinicsTable, eq(clinicsTable.id, patientAccessRequestsTable.requestingClinicId))
      .where(eq(patientAccessRequestsTable.sourceClinicId, req.clinicId))
      .orderBy(desc(patientAccessRequestsTable.createdAt));

    // Enriquecer com o nome do paciente
    const enriched = await Promise.all(
      requests.map(async (r) => {
        const [patient] = await db
          .select({ name: patientsTable.name })
          .from(patientsTable)
          .innerJoin(patientClinicsTable, and(
            eq(patientClinicsTable.patientId, patientsTable.id),
            eq(patientClinicsTable.clinicId, req.clinicId!),
            isNull(patientClinicsTable.deletedAt),
          ))
          .where(eq(patientsTable.cpf, r.cpf))
          .limit(1);
        return { ...r, patientName: patient?.name ?? null };
      }),
    );

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /api/patients/access-requests/outgoing
 * Lista as solicitações enviadas pela clínica atual.
 */
router.get("/access-requests/outgoing", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    if (!req.clinicId) {
      res.json([]);
      return;
    }

    const requests = await db
      .select({
        id: patientAccessRequestsTable.id,
        cpf: patientAccessRequestsTable.cpf,
        status: patientAccessRequestsTable.status,
        scope: patientAccessRequestsTable.scope,
        message: patientAccessRequestsTable.message,
        respondedAt: patientAccessRequestsTable.respondedAt,
        createdAt: patientAccessRequestsTable.createdAt,
        sourceClinicId: patientAccessRequestsTable.sourceClinicId,
        sourceClinicName: clinicsTable.name,
      })
      .from(patientAccessRequestsTable)
      .leftJoin(clinicsTable, eq(clinicsTable.id, patientAccessRequestsTable.sourceClinicId))
      .where(eq(patientAccessRequestsTable.requestingClinicId, req.clinicId))
      .orderBy(desc(patientAccessRequestsTable.createdAt));

    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * PATCH /api/patients/access-requests/:id
 * Aprova ou nega uma solicitação de acesso (apenas a clínica de origem pode fazer isso).
 */
router.patch("/access-requests/:id", requirePermission("patients.update"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Bad Request", message: "ID inválido." });
      return;
    }

    const schema = z.object({
      status: z.enum(["approved", "denied"]),
    });
    const parsed = validateBody(schema, req.body, res);
    if (!parsed) return;

    if (!req.clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Clínica não identificada." });
      return;
    }

    // Apenas a clínica de origem pode responder
    const [existing] = await db
      .select()
      .from(patientAccessRequestsTable)
      .where(and(
        eq(patientAccessRequestsTable.id, id),
        eq(patientAccessRequestsTable.sourceClinicId, req.clinicId),
      ))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Not Found", message: "Solicitação não encontrada." });
      return;
    }

    if (existing.status !== "pending") {
      res.status(400).json({ error: "Bad Request", message: "Esta solicitação já foi respondida." });
      return;
    }

    const [updated] = await db
      .update(patientAccessRequestsTable)
      .set({ status: parsed.status, respondedAt: new Date() })
      .where(eq(patientAccessRequestsTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
