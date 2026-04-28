import { Router } from "express";
import { db } from "@workspace/db";
import { clinicsTable, usersTable, userRolesTable } from "@workspace/db";
import { subscriptionPlansTable, clinicSubscriptionsTable } from "@workspace/db";
import type { Role } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requireSuperAdmin, requirePermission } from "../../../middleware/rbac.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../../../middleware/auth.js";
import { setAuthCookie } from "../../../middleware/cookies.js";
import { todayBRT } from "../../../utils/dateUtils.js";

const router = Router();
router.use(authMiddleware);

router.get("/", requireSuperAdmin(), async (_req, res) => {
  try {
    const clinics = await db
      .select()
      .from(clinicsTable)
      .orderBy(desc(clinicsTable.createdAt));
    res.json(clinics);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/", requireSuperAdmin(), async (req: AuthRequest, res) => {
  try {
    const { name, type, cnpj, cpf, crefito, responsibleTechnical, phone, email, address, website, logoUrl, planId } = req.body;
    if (!name) {
      res.status(400).json({ error: "Bad Request", message: "Nome é obrigatório" });
      return;
    }

    // Find the plan to assign (use planId if provided, otherwise first active plan)
    let selectedPlan = null;
    if (planId) {
      const [p] = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, Number(planId))).limit(1);
      selectedPlan = p ?? null;
    } else {
      const plans = await db.select().from(subscriptionPlansTable).where(eq(subscriptionPlansTable.isActive, true)).orderBy(asc(subscriptionPlansTable.sortOrder)).limit(1);
      selectedPlan = plans[0] ?? null;
    }

    const clinic = await db.transaction(async (tx) => {
      const [clinic] = await tx
        .insert(clinicsTable)
        .values({
          name,
          type: type || "clinica",
          cnpj: cnpj?.replace(/\D/g, "") || null,
          cpf: cpf?.replace(/\D/g, "") || null,
          crefito: crefito || null,
          responsibleTechnical: responsibleTechnical || null,
          phone,
          email,
          address,
          website: website || null,
          logoUrl: logoUrl || null,
        })
        .returning();

      if (selectedPlan) {
        const today = todayBRT();
        const trialEnd = new Date(today);
        trialEnd.setDate(trialEnd.getDate() + (selectedPlan.trialDays ?? 30));
        await tx.insert(clinicSubscriptionsTable).values({
          clinicId: clinic.id,
          planId: selectedPlan.id,
          status: "trial",
          trialStartDate: today,
          trialEndDate: trialEnd.toISOString().split("T")[0],
          amount: selectedPlan.price,
          paymentStatus: "pending",
        });
      }

      return clinic;
    });

    res.status(201).json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/current", requirePermission("settings.manage"), async (req: AuthRequest, res) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Nenhuma clínica ativa no contexto" });
      return;
    }
    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    if (!clinic) {
      res.status(404).json({ error: "Not Found", message: "Clínica não encontrada" });
      return;
    }
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const updateCurrentClinic = async (req: AuthRequest, res: import("express").Response) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "Nenhuma clínica ativa no contexto" });
      return;
    }
    const { name, type, cnpj, cpf, crefito, responsibleTechnical, phone, email, address, website, logoUrl,
            cancellationPolicyHours, autoConfirmHours, noShowFeeEnabled, noShowFeeAmount } = req.body;
    const [clinic] = await db
      .update(clinicsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(cnpj !== undefined && { cnpj: cnpj ? cnpj.replace(/\D/g, "") : null }),
        ...(cpf !== undefined && { cpf: cpf ? cpf.replace(/\D/g, "") : null }),
        ...(crefito !== undefined && { crefito }),
        ...(responsibleTechnical !== undefined && { responsibleTechnical }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(website !== undefined && { website }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(cancellationPolicyHours !== undefined && { cancellationPolicyHours: cancellationPolicyHours === null || cancellationPolicyHours === "" ? null : Number(cancellationPolicyHours) }),
        ...(autoConfirmHours !== undefined && { autoConfirmHours: autoConfirmHours === null || autoConfirmHours === "" ? null : Number(autoConfirmHours) }),
        ...(noShowFeeEnabled !== undefined && { noShowFeeEnabled: Boolean(noShowFeeEnabled) }),
        ...(noShowFeeAmount !== undefined && { noShowFeeAmount: noShowFeeAmount || null }),
      })
      .where(eq(clinicsTable.id, clinicId))
      .returning();
    if (!clinic) {
      res.status(404).json({ error: "Not Found", message: "Clínica não encontrada" });
      return;
    }
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

router.put("/current", requirePermission("settings.manage"), updateCurrentClinic);
router.patch("/current", requirePermission("settings.manage"), updateCurrentClinic);

router.get("/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, id))
      .limit(1);
    if (!clinic) {
      res.status(404).json({ error: "Not Found", message: "Clínica não encontrada" });
      return;
    }
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const { name, type, cnpj, cpf, crefito, responsibleTechnical, phone, email, address, website, logoUrl, isActive } = req.body;
    const [clinic] = await db
      .update(clinicsTable)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(cnpj !== undefined && { cnpj: cnpj ? cnpj.replace(/\D/g, "") : null }),
        ...(cpf !== undefined && { cpf: cpf ? cpf.replace(/\D/g, "") : null }),
        ...(crefito !== undefined && { crefito }),
        ...(responsibleTechnical !== undefined && { responsibleTechnical }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(website !== undefined && { website }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(isActive !== undefined && { isActive }),
      })
      .where(eq(clinicsTable.id, id))
      .returning();
    if (!clinic) {
      res.status(404).json({ error: "Not Found", message: "Clínica não encontrada" });
      return;
    }
    res.json(clinic);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requireSuperAdmin(), async (req, res) => {
  try {
    const id = parseInt(req.params.id as string);
    await db.delete(clinicsTable).where(eq(clinicsTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/:id/users", requireSuperAdmin(), async (req, res) => {
  try {
    const clinicId = parseInt(req.params.id as string);
    const rows = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: userRolesTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(userRolesTable)
      .innerJoin(usersTable, eq(userRolesTable.userId, usersTable.id))
      .where(eq(userRolesTable.clinicId, clinicId));

    const userMap = new Map<
      number,
      { id: number; name: string; email: string | null; roles: Role[]; createdAt: Date }
    >();
    for (const row of rows) {
      if (!userMap.has(row.userId)) {
        userMap.set(row.userId, {
          id: row.userId,
          name: row.name,
          email: row.email,
          roles: [],
          createdAt: row.createdAt,
        });
      }
      userMap.get(row.userId)!.roles.push(row.role as Role);
    }
    res.json(Array.from(userMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/:id/users", requireSuperAdmin(), async (req, res) => {
  try {
    const clinicId = parseInt(req.params.id as string);
    const { name, cpf, email, password, roles } = req.body;
    const roleList: Role[] = Array.isArray(roles) && roles.length > 0 ? roles : ["profissional"];

    if (!name || !cpf || !password) {
      res.status(400).json({ error: "Bad Request", message: "Nome, CPF e senha são obrigatórios" });
      return;
    }

    const normalizedCpf = cpf.replace(/\D/g, "");
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.cpf, normalizedCpf))
      .limit(1);

    const passwordHash = existing[0] ? null : await bcrypt.hash(password, 10);

    const { userId, userName, userEmail } = await db.transaction(async (tx) => {
      let user = existing[0];
      if (!user) {
        const [newUser] = await tx
          .insert(usersTable)
          .values({
            name,
            cpf: normalizedCpf,
            email: email ? email.toLowerCase().trim() : null,
            passwordHash: passwordHash!,
            clinicId,
          })
          .returning();
        user = newUser;
      }

      const existingRole = await tx
        .select()
        .from(userRolesTable)
        .where(and(eq(userRolesTable.userId, user.id), eq(userRolesTable.clinicId, clinicId)))
        .limit(1);

      if (existingRole.length === 0) {
        await tx.insert(userRolesTable).values(
          roleList.map((role) => ({ userId: user.id, clinicId, role }))
        );
      }

      return { userId: user.id, userName: user.name, userEmail: user.email };
    });

    res.status(201).json({ id: userId, name: userName, email: userEmail, roles: roleList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id/users/:userId", requireSuperAdmin(), async (req, res) => {
  try {
    const clinicId = parseInt(req.params.id as string);
    const userId = parseInt(req.params.userId as string);
    const { name, email, password, roles } = req.body;

    const roleList: Role[] = Array.isArray(roles) && roles.length > 0 ? roles : ["profissional"];

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (email !== undefined) updateData.email = email ? email.toLowerCase().trim() : null;
    if (password) {
      const bcrypt = await import("bcryptjs");
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(usersTable).set(updateData).where(eq(usersTable.id, userId));
    }

    await db.delete(userRolesTable).where(
      and(eq(userRolesTable.userId, userId), eq(userRolesTable.clinicId, clinicId))
    );
    await db.insert(userRolesTable).values(
      roleList.map((role) => ({ userId, clinicId, role }))
    );

    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    res.json({ id: updated.id, name: updated.name, email: updated.email, roles: roleList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id/users/:userId", requireSuperAdmin(), async (req, res) => {
  try {
    const clinicId = parseInt(req.params.id as string);
    const userId = parseInt(req.params.userId as string);
    await db.delete(userRolesTable).where(
      and(eq(userRolesTable.userId, userId), eq(userRolesTable.clinicId, clinicId))
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/:id/impersonate", requireSuperAdmin(), async (req: AuthRequest, res) => {
  try {
    const clinicId = parseInt(req.params.id as string);
    const [clinic] = await db
      .select()
      .from(clinicsTable)
      .where(eq(clinicsTable.id, clinicId))
      .limit(1);
    if (!clinic) {
      res.status(404).json({ error: "Not Found", message: "Clínica não encontrada" });
      return;
    }
    const token = generateToken(req.userId!, ["admin"], clinicId, true);
    setAuthCookie(res, token);
    res.json({ token, clinicId, clinicName: clinic.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
