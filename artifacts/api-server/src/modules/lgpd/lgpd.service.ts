import { logAudit } from "../../utils/auditLog.js";
import { lgpdRepository } from "./lgpd.repository.js";
import type { PolicyDocument } from "@workspace/db";

export class LgpdError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const lgpdService = {
  // ── Public reads ─────────────────────────────────────────────────────────
  async getCurrentPolicies(): Promise<PolicyDocument[]> {
    return lgpdRepository.listAllCurrent();
  },

  async getCurrentPolicyByType(type: string): Promise<PolicyDocument> {
    const doc = await lgpdRepository.findCurrent(type);
    if (!doc) {
      throw new LgpdError(404, "Not Found", `Política '${type}' não publicada`);
    }
    return doc;
  },

  async getPolicyHistory(type: string): Promise<PolicyDocument[]> {
    return lgpdRepository.listHistory(type);
  },

  // ── Acceptance ───────────────────────────────────────────────────────────
  async getUserStatus(userId: number) {
    const [current, accepted] = await Promise.all([
      lgpdRepository.listAllCurrent(),
      lgpdRepository.findUserAcceptances(userId),
    ]);
    const acceptedIds = new Set(accepted.map((a) => a.policyDocumentId));
    const pending = current.filter((doc) => !acceptedIds.has(doc.id));
    return {
      current: current.map((doc) => ({
        id: doc.id,
        type: doc.type,
        version: doc.version,
        title: doc.title,
        publishedAt: doc.publishedAt,
        accepted: acceptedIds.has(doc.id),
      })),
      pending: pending.map((doc) => ({
        id: doc.id,
        type: doc.type,
        version: doc.version,
        title: doc.title,
      })),
      hasPending: pending.length > 0,
    };
  },

  async acceptPolicy(input: {
    userId: number;
    userName?: string | null;
    policyDocumentId: number;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const doc = await lgpdRepository.findById(input.policyDocumentId);
    if (!doc) {
      throw new LgpdError(404, "Not Found", "Política não encontrada");
    }
    await lgpdRepository.insertAcceptance({
      userId: input.userId,
      policyDocumentId: input.policyDocumentId,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    await logAudit({
      userId: input.userId,
      userName: input.userName,
      action: "create",
      entityType: "policy_acceptance",
      entityId: input.policyDocumentId,
      summary: `Aceitou ${doc.type} v${doc.version}`,
    });
    return { ok: true, policyDocumentId: input.policyDocumentId };
  },

  // ── Patient data export (LGPD portability) ───────────────────────────────
  async exportPatientData(input: {
    patientId: number;
    requestedByUserId: number;
    requestedByUserName?: string | null;
  }) {
    const patient = await lgpdRepository.getPatientById(input.patientId);
    if (!patient) {
      throw new LgpdError(404, "Not Found", "Paciente não encontrado");
    }

    const [
      appointments,
      anamnesis,
      evolutions,
      evaluations,
      certificates,
      bodyMeasurements,
      dischargeSummaries,
      treatmentPlans,
      photos,
      packages,
      walletData,
      journey,
      financial,
    ] = await Promise.all([
      lgpdRepository.getPatientAppointments(input.patientId),
      lgpdRepository.getPatientAnamnesis(input.patientId),
      lgpdRepository.getPatientEvolutions(input.patientId),
      lgpdRepository.getPatientEvaluations(input.patientId),
      lgpdRepository.getPatientCertificates(input.patientId),
      lgpdRepository.getPatientBodyMeasurements(input.patientId),
      lgpdRepository.getPatientDischargeSummaries(input.patientId),
      lgpdRepository.getPatientTreatmentPlans(input.patientId),
      lgpdRepository.getPatientPhotos(input.patientId),
      lgpdRepository.getPatientPackages(input.patientId),
      lgpdRepository.getPatientWallet(input.patientId),
      lgpdRepository.getPatientJourney(input.patientId),
      lgpdRepository.getPatientFinancial(input.patientId),
    ]);

    const credits = await lgpdRepository.getPatientCredits(packages.map((p) => p.id));

    await logAudit({
      userId: input.requestedByUserId,
      userName: input.requestedByUserName,
      patientId: input.patientId,
      action: "create",
      entityType: "lgpd_export",
      entityId: input.patientId,
      summary: `Exportação LGPD de dados do paciente #${input.patientId} (${patient.name})`,
    });

    return {
      meta: {
        exportedAt: new Date().toISOString(),
        requestedByUserId: input.requestedByUserId,
        requestedByUserName: input.requestedByUserName ?? null,
        legalBasis: "LGPD Art. 18, V — direito à portabilidade dos dados",
        format: "JSON",
        version: "1.0.0",
      },
      patient,
      clinical: {
        anamnesis,
        evaluations,
        evolutions,
        treatmentPlans,
        bodyMeasurements,
        photos,
        certificates,
        dischargeSummaries,
      },
      operations: {
        appointments,
        journey,
        packages,
        sessionCredits: credits,
      },
      financial: {
        records: financial,
        wallet: walletData.wallet,
        walletTransactions: walletData.transactions,
      },
    };
  },
};
