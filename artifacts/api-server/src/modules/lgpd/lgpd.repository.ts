import { db } from "@workspace/db";
import {
  policyDocumentsTable,
  userPolicyAcceptancesTable,
  patientsTable,
  appointmentsTable,
  anamnesisTable,
  evolutionsTable,
  evaluationsTable,
  atestadosTable,
  bodyMeasurementsTable,
  dischargeSummariesTable,
  treatmentPlansTable,
  patientPhotosTable,
  patientPackagesTable,
  sessionCreditsTable,
  patientWalletTable,
  patientWalletTransactionsTable,
  patientJourneyStepsTable,
  financialRecordsTable,
  type PolicyDocument,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";

export const lgpdRepository = {
  // ── Policy documents ──────────────────────────────────────────────────────
  async findCurrent(type: string): Promise<PolicyDocument | null> {
    const [row] = await db
      .select()
      .from(policyDocumentsTable)
      .where(
        and(
          eq(policyDocumentsTable.type, type),
          eq(policyDocumentsTable.isCurrent, true),
        ),
      )
      .limit(1);
    return row ?? null;
  },

  async findById(id: number): Promise<PolicyDocument | null> {
    const [row] = await db
      .select()
      .from(policyDocumentsTable)
      .where(eq(policyDocumentsTable.id, id))
      .limit(1);
    return row ?? null;
  },

  async listHistory(type: string): Promise<PolicyDocument[]> {
    return db
      .select()
      .from(policyDocumentsTable)
      .where(eq(policyDocumentsTable.type, type))
      .orderBy(desc(policyDocumentsTable.publishedAt));
  },

  async listAllCurrent(): Promise<PolicyDocument[]> {
    return db
      .select()
      .from(policyDocumentsTable)
      .where(eq(policyDocumentsTable.isCurrent, true));
  },

  // ── Acceptances ──────────────────────────────────────────────────────────
  async findUserAcceptances(userId: number) {
    return db
      .select()
      .from(userPolicyAcceptancesTable)
      .where(eq(userPolicyAcceptancesTable.userId, userId));
  },

  async hasAccepted(userId: number, policyDocumentId: number) {
    const [row] = await db
      .select({ id: userPolicyAcceptancesTable.id })
      .from(userPolicyAcceptancesTable)
      .where(
        and(
          eq(userPolicyAcceptancesTable.userId, userId),
          eq(userPolicyAcceptancesTable.policyDocumentId, policyDocumentId),
        ),
      )
      .limit(1);
    return !!row;
  },

  async insertAcceptance(input: {
    userId: number;
    policyDocumentId: number;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    // ON CONFLICT DO NOTHING via unique index (user_id, policy_document_id)
    await db
      .insert(userPolicyAcceptancesTable)
      .values({
        userId: input.userId,
        policyDocumentId: input.policyDocumentId,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      })
      .onConflictDoNothing();
  },

  // ── Patient export (LGPD portability) ────────────────────────────────────
  async getPatientById(patientId: number) {
    const [row] = await db
      .select()
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId))
      .limit(1);
    return row ?? null;
  },

  async getPatientAppointments(patientId: number) {
    return db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.patientId, patientId))
      .orderBy(desc(appointmentsTable.date));
  },

  async getPatientAnamnesis(patientId: number) {
    return db
      .select()
      .from(anamnesisTable)
      .where(eq(anamnesisTable.patientId, patientId));
  },

  async getPatientEvolutions(patientId: number) {
    return db
      .select()
      .from(evolutionsTable)
      .where(eq(evolutionsTable.patientId, patientId))
      .orderBy(desc(evolutionsTable.createdAt));
  },

  async getPatientEvaluations(patientId: number) {
    return db
      .select()
      .from(evaluationsTable)
      .where(eq(evaluationsTable.patientId, patientId))
      .orderBy(desc(evaluationsTable.createdAt));
  },

  async getPatientCertificates(patientId: number) {
    return db
      .select()
      .from(atestadosTable)
      .where(eq(atestadosTable.patientId, patientId))
      .orderBy(desc(atestadosTable.issuedAt));
  },

  async getPatientBodyMeasurements(patientId: number) {
    return db
      .select()
      .from(bodyMeasurementsTable)
      .where(eq(bodyMeasurementsTable.patientId, patientId))
      .orderBy(desc(bodyMeasurementsTable.measuredAt));
  },

  async getPatientDischargeSummaries(patientId: number) {
    return db
      .select()
      .from(dischargeSummariesTable)
      .where(eq(dischargeSummariesTable.patientId, patientId));
  },

  async getPatientTreatmentPlans(patientId: number) {
    return db
      .select()
      .from(treatmentPlansTable)
      .where(eq(treatmentPlansTable.patientId, patientId));
  },

  async getPatientPhotos(patientId: number) {
    return db
      .select()
      .from(patientPhotosTable)
      .where(eq(patientPhotosTable.patientId, patientId));
  },

  async getPatientPackages(patientId: number) {
    return db
      .select()
      .from(patientPackagesTable)
      .where(eq(patientPackagesTable.patientId, patientId));
  },

  async getPatientCredits(patientPackageIds: number[]) {
    if (patientPackageIds.length === 0) return [];
    return db
      .select()
      .from(sessionCreditsTable)
      .where(inArray(sessionCreditsTable.patientPackageId, patientPackageIds));
  },

  async getPatientWallet(patientId: number) {
    const [wallet] = await db
      .select()
      .from(patientWalletTable)
      .where(eq(patientWalletTable.patientId, patientId))
      .limit(1);
    if (!wallet) return { wallet: null, transactions: [] };
    const transactions = await db
      .select()
      .from(patientWalletTransactionsTable)
      .where(eq(patientWalletTransactionsTable.walletId, wallet.id))
      .orderBy(desc(patientWalletTransactionsTable.createdAt));
    return { wallet, transactions };
  },

  async getPatientJourney(patientId: number) {
    return db
      .select()
      .from(patientJourneyStepsTable)
      .where(eq(patientJourneyStepsTable.patientId, patientId))
      .orderBy(desc(patientJourneyStepsTable.createdAt));
  },

  async getPatientFinancial(patientId: number) {
    return db
      .select()
      .from(financialRecordsTable)
      .where(eq(financialRecordsTable.patientId, patientId))
      .orderBy(desc(financialRecordsTable.dueDate));
  },
};
