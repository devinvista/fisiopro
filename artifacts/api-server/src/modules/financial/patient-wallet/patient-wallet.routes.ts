/**
 * patient-wallet — Carteira de crédito em R$ por paciente
 *
 * Endpoints:
 *   GET  /patients/:patientId/wallet         — saldo e histórico de transações
 *   POST /patients/:patientId/wallet/deposit  — depositar crédito
 *   POST /patients/:patientId/wallet/refund   — estornar transação
 *   GET  /wallet                              — listar carteiras da clínica (admin)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  patientWalletTable,
  patientWalletTransactionsTable,
  patientsTable,
  financialRecordsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { validateBody } from "../../../utils/validate.js";
import { todayBRT } from "../../../utils/dateUtils.js";
import { postWalletDeposit } from "../../_shared/accounting/accounting.service.js";
import { z } from "zod/v4";

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateWallet(patientId: number, clinicId: number | null) {
  const conditions: any[] = [eq(patientWalletTable.patientId, patientId)];
  if (clinicId) conditions.push(eq(patientWalletTable.clinicId, clinicId));

  const [existing] = await db
    .select()
    .from(patientWalletTable)
    .where(and(...conditions))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(patientWalletTable)
    .values({ patientId, clinicId, balance: "0" })
    .returning();

  return created;
}

// ─── GET /patients/:patientId/wallet ─────────────────────────────────────────

router.get("/wallet", requirePermission("patients.read"), async (req: AuthRequest, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    if (isNaN(patientId)) {
      res.status(400).json({ error: "Bad Request", message: "patientId inválido" });
      return;
    }

    const clinicId = req.isSuperAdmin ? null : (req.clinicId ?? null);

    const wallet = await getOrCreateWallet(patientId, clinicId);

    const conditions: any[] = [eq(patientWalletTransactionsTable.walletId, wallet.id)];

    const transactions = await db
      .select()
      .from(patientWalletTransactionsTable)
      .where(and(...conditions))
      .orderBy(desc(patientWalletTransactionsTable.createdAt))
      .limit(50);

    res.json({ wallet, transactions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── POST /patients/:patientId/wallet/deposit ─────────────────────────────────

const depositSchema = z.object({
  amount: z
    .union([z.number(), z.string().transform(Number)])
    .refine((v) => !isNaN(v) && v > 0, "amount deve ser um número positivo"),
  description: z.string().max(500).optional(),
  paymentMethod: z.string().optional(),
});

router.post("/wallet/deposit", requirePermission("financial.write"), async (req: AuthRequest, res) => {
  try {
    const patientId = parseInt(req.params.patientId as string);
    if (isNaN(patientId)) {
      res.status(400).json({ error: "Bad Request", message: "patientId inválido" });
      return;
    }

    const body = validateBody(depositSchema, req.body, res);
    if (!body) return;

    const clinicId = req.isSuperAdmin ? null : (req.clinicId ?? null);

    // Busca nome do paciente
    const [patient] = await db
      .select({ name: patientsTable.name })
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId))
      .limit(1);

    if (!patient) {
      res.status(404).json({ error: "Not Found", message: "Paciente não encontrado" });
      return;
    }

    const wallet = await getOrCreateWallet(patientId, clinicId);
    const newBalance = (Number(wallet.balance) + Number(body.amount)).toFixed(2);

    await db.transaction(async (tx) => {
      // Atualiza saldo da carteira
      await tx
        .update(patientWalletTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(patientWalletTable.id, wallet.id));

      // Cria lançamento financeiro (receita paga)
      const description = body.description ?? `Depósito na carteira — ${patient.name}`;
      const [fr] = await tx
        .insert(financialRecordsTable)
        .values({
          type:            "receita",
          amount:          String(body.amount),
          description,
          category:        "Carteira de Crédito",
          patientId,
          clinicId,
          transactionType: "depositoCarteira",
          status:          "pago",
          paymentMethod:   body.paymentMethod ?? null,
          dueDate:         todayBRT(),
          paymentDate:     todayBRT(),
        })
        .returning();

      // Cria transação na carteira
      const [walletTransaction] = await tx.insert(patientWalletTransactionsTable).values({
        walletId:          wallet.id,
        patientId,
        clinicId,
        amount:            String(body.amount),
        type:              "deposito",
        description,
        financialRecordId: fr.id,
      }).returning();

      const entry = await postWalletDeposit({
        clinicId,
        entryDate: todayBRT(),
        amount: Number(body.amount),
        description,
        sourceType: "patient_wallet_transaction",
        sourceId: walletTransaction.id,
        patientId,
        walletTransactionId: walletTransaction.id,
        financialRecordId: fr.id,
      }, tx as any);

      await tx
        .update(financialRecordsTable)
        .set({ accountingEntryId: entry.id, settlementEntryId: entry.id })
        .where(eq(financialRecordsTable.id, fr.id));
    });

    // Retorna carteira atualizada
    const [updatedWallet] = await db
      .select()
      .from(patientWalletTable)
      .where(eq(patientWalletTable.id, wallet.id))
      .limit(1);

    res.status(201).json({ wallet: updatedWallet, deposited: Number(body.amount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ─── GET /wallet (admin: listar carteiras da clínica) ────────────────────────

const walletListRouter = Router();

walletListRouter.get("/wallet", authMiddleware as any, requirePermission("financial.read"), async (req: AuthRequest, res) => {
  try {
    const clinicId = req.isSuperAdmin ? null : (req.clinicId ?? null);

    const conditions: any[] = [];
    if (clinicId) conditions.push(eq(patientWalletTable.clinicId, clinicId));

    const query = db
      .select({
        wallet:      patientWalletTable,
        patientName: patientsTable.name,
        patientId:   patientsTable.id,
      })
      .from(patientWalletTable)
      .leftJoin(patientsTable, eq(patientWalletTable.patientId, patientsTable.id)) as any;

    const wallets = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    res.json(wallets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export { walletListRouter };
export default router;
