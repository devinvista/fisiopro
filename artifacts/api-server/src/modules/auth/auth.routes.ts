import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, userRolesTable, clinicsTable } from "@workspace/db";
import type { Role } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { generateToken, authMiddleware, AuthRequest } from "../../middleware/auth.js";
import { validateBody } from "../../utils/validate.js";
import { todayBRT } from "../../utils/dateUtils.js";
import { z } from "zod/v4";
import { subscriptionPlansTable, clinicSubscriptionsTable, couponsTable, couponUsesTable } from "@workspace/db";

const registerSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().min(1, "CPF é obrigatório"),
  email: z.email("E-mail inválido").optional().nullable(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  clinicName: z.string().min(1, "Nome da clínica é obrigatório").max(200),
  profileType: z.enum(["clinica", "autonomo"]).optional().default("clinica"),
  planName: z.string().optional().default("essencial"),
  couponCode: z.string().optional().nullable(),
});

const loginSchema = z.object({
  email: z.string().min(1, "Identificador é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
  clinicId: z.number().int().positive().optional().nullable(),
});

const switchClinicSchema = z.object({
  clinicId: z.union([z.number().int().positive(), z.null()]).optional(),
});

const router = Router();

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "");
}

function isEmail(value: string): boolean {
  return value.includes("@");
}

function isCpf(value: string): boolean {
  return /^\d{11}$/.test(normalizeCpf(value));
}

async function getUserClinics(userId: number) {
  const rows = await db
    .select({
      clinicId: userRolesTable.clinicId,
      role: userRolesTable.role,
      clinicName: clinicsTable.name,
    })
    .from(userRolesTable)
    .leftJoin(clinicsTable, eq(userRolesTable.clinicId, clinicsTable.id))
    .where(and(eq(userRolesTable.userId, userId)));

  const clinicMap = new Map<number, { id: number; name: string; roles: Role[] }>();
  for (const row of rows) {
    if (!row.clinicId || !row.clinicName) continue;
    if (!clinicMap.has(row.clinicId)) {
      clinicMap.set(row.clinicId, { id: row.clinicId, name: row.clinicName, roles: [] });
    }
    clinicMap.get(row.clinicId)!.roles.push(row.role as Role);
  }
  return Array.from(clinicMap.values());
}

async function getUserRolesForClinic(userId: number, clinicId: number | null): Promise<Role[]> {
  const query = clinicId
    ? db
        .select({ role: userRolesTable.role })
        .from(userRolesTable)
        .where(and(eq(userRolesTable.userId, userId), eq(userRolesTable.clinicId, clinicId)))
    : db
        .select({ role: userRolesTable.role })
        .from(userRolesTable)
        .where(and(eq(userRolesTable.userId, userId), isNull(userRolesTable.clinicId)));

  const rows = await query;
  return rows.map((r) => r.role as Role);
}

router.post("/register", async (req, res) => {
  try {
    const body = validateBody(registerSchema, req.body, res);
    if (!body) return;
    const { name, email, cpf, password, clinicName, profileType, planName, couponCode } = body;

    const normalizedCpf = normalizeCpf(cpf);
    if (normalizedCpf.length !== 11) {
      res.status(400).json({ error: "Bad Request", message: "CPF inválido. Informe os 11 dígitos." });
      return;
    }

    const existingCpf = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.cpf, normalizedCpf))
      .limit(1);
    if (existingCpf.length > 0) {
      res.status(400).json({ error: "Bad Request", message: "CPF já cadastrado" });
      return;
    }

    if (email) {
      const existing = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email.toLowerCase().trim()))
        .limit(1);
      if (existing.length > 0) {
        res.status(400).json({ error: "Bad Request", message: "E-mail já cadastrado" });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const plan = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.name, planName ?? "essencial"))
      .limit(1);
    const selectedPlan = plan[0] ?? null;

    // Validate coupon if provided
    let coupon: typeof couponsTable.$inferSelect | null = null;
    if (couponCode) {
      const [found] = await db
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.code, couponCode.toUpperCase().trim()))
        .limit(1);
      if (found && found.isActive) {
        const notExpired = !found.expiresAt || new Date(found.expiresAt) >= new Date();
        const notExhausted = found.maxUses === null || found.usedCount < found.maxUses;
        const planAllowed =
          !found.applicablePlanNames ||
          (found.applicablePlanNames as string[]).length === 0 ||
          (found.applicablePlanNames as string[]).includes(planName ?? "essencial");
        if (notExpired && notExhausted && planAllowed) {
          coupon = found;
        }
      }
    }

    const { clinic, user } = await db.transaction(async (tx) => {
      const [clinic] = await tx
        .insert(clinicsTable)
        .values({ name: clinicName.trim() })
        .returning();

      const [user] = await tx
        .insert(usersTable)
        .values({
          name,
          cpf: normalizedCpf,
          email: email ? email.toLowerCase().trim() : null,
          passwordHash,
          clinicId: clinic.id,
        })
        .returning();

      const rolesToInsert: { userId: number; clinicId: number; role: Role }[] = [
        { userId: user.id, clinicId: clinic.id, role: "admin" },
      ];
      if (profileType === "autonomo") {
        rolesToInsert.push({ userId: user.id, clinicId: clinic.id, role: "profissional" });
      }
      await tx.insert(userRolesTable).values(rolesToInsert);

      if (selectedPlan) {
        const today = todayBRT();
        const baseDays = selectedPlan.trialDays ?? 30;

        // Apply coupon: extend trial or reduce subscription price
        let extraDays = 0;
        let discountedAmount = Number(selectedPlan.price);
        let discountApplied = 0;

        if (coupon) {
          if (coupon.discountType === "percent") {
            const pct = Number(coupon.discountValue);
            discountApplied = (discountedAmount * pct) / 100;
            discountedAmount = Math.max(0, discountedAmount - discountApplied);
            // Also give extra trial days proportional to discount
            extraDays = Math.round((baseDays * pct) / 100);
          } else {
            discountApplied = Number(coupon.discountValue);
            discountedAmount = Math.max(0, discountedAmount - discountApplied);
            extraDays = Math.round((discountApplied / Number(selectedPlan.price)) * baseDays);
          }
        }

        const trialEnd = new Date(today);
        trialEnd.setDate(trialEnd.getDate() + baseDays + extraDays);

        const [sub] = await tx.insert(clinicSubscriptionsTable).values({
          clinicId: clinic.id,
          planId: selectedPlan.id,
          status: "trial",
          trialStartDate: today,
          trialEndDate: trialEnd.toISOString().split("T")[0],
          amount: String(discountedAmount),
          paymentStatus: "pending",
          notes: coupon ? `Cupom aplicado: ${coupon.code} (desconto: R$ ${discountApplied.toFixed(2)})` : null,
        }).returning();

        if (coupon) {
          await tx.insert(couponUsesTable).values({
            couponId: coupon.id,
            clinicId: clinic.id,
            subscriptionId: sub.id,
            discountApplied: String(discountApplied),
            extraTrialDays: extraDays,
          });
          await tx
            .update(couponsTable)
            .set({ usedCount: (coupon.usedCount ?? 0) + 1, updatedAt: new Date() })
            .where(eq(couponsTable.id, coupon.id));
        }
      }

      return { clinic, user };
    });

    const assignedRoles: Role[] = profileType === "autonomo" ? ["admin", "profissional"] : ["admin"];
    const token = generateToken(user.id, assignedRoles, clinic.id, false, user.name);
    res.status(201).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: assignedRoles,
        clinicId: clinic.id,
        isSuperAdmin: false,
        createdAt: user.createdAt,
      },
      clinic: { id: clinic.id, name: clinic.name },
      clinics: [{ id: clinic.id, name: clinic.name, roles: assignedRoles }],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Falha no cadastro" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const body = validateBody(loginSchema, req.body, res);
    if (!body) return;
    const { email: identifier, password, clinicId: preferredClinicId } = body;

    let user: typeof usersTable.$inferSelect | undefined;

    if (isEmail(identifier)) {
      const rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, identifier.toLowerCase().trim()))
        .limit(1);
      user = rows[0];
    } else if (isCpf(identifier)) {
      const normalizedCpf = normalizeCpf(identifier);
      const rows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.cpf, normalizedCpf))
        .limit(1);
      user = rows[0];
    } else {
      res.status(401).json({ error: "Unauthorized", message: "Credenciais inválidas" });
      return;
    }

    if (!user) {
      res.status(401).json({ error: "Unauthorized", message: "Credenciais inválidas" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Unauthorized", message: "Credenciais inválidas" });
      return;
    }

    if (user.isSuperAdmin) {
      const token = generateToken(user.id, [], null, true, user.name);
      const clinics = await getUserClinics(user.id);
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: [],
          clinicId: null,
          isSuperAdmin: true,
          createdAt: user.createdAt,
        },
        clinics,
      });
      return;
    }

    const clinics = await getUserClinics(user.id);

    if (clinics.length === 0) {
      res.status(403).json({
        error: "Forbidden",
        message: "Usuário sem acesso a nenhuma clínica",
      });
      return;
    }

    let activeClinic = clinics[0];
    if (preferredClinicId) {
      const found = clinics.find((c) => c.id === Number(preferredClinicId));
      if (found) activeClinic = found;
    }

    const token = generateToken(user.id, activeClinic.roles, activeClinic.id, false, user.name);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: activeClinic.roles,
        clinicId: activeClinic.id,
        isSuperAdmin: false,
        createdAt: user.createdAt,
      },
      clinic: { id: activeClinic.id, name: activeClinic.name },
      clinics,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error", message: "Falha no login" });
  }
});

router.post("/switch-clinic", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const body = validateBody(switchClinicSchema, req.body, res);
    if (!body) return;
    const { clinicId } = body;

    if (req.isSuperAdmin && (clinicId === null || clinicId === undefined || clinicId === 0)) {
      const token = generateToken(req.userId!, [], null, true, req.userName);
      res.json({ token, clinicId: null });
      return;
    }

    if (!clinicId) {
      res.status(400).json({ error: "Bad Request", message: "clinicId é obrigatório" });
      return;
    }

    if (req.isSuperAdmin) {
      const [clinic] = await db
        .select()
        .from(clinicsTable)
        .where(eq(clinicsTable.id, Number(clinicId)))
        .limit(1);
      if (!clinic) {
        res.status(404).json({ error: "Not Found", message: "Clínica não encontrada" });
        return;
      }
      const token = generateToken(req.userId!, ["admin"], Number(clinicId), true, req.userName);
      res.json({ token, clinicId: Number(clinicId), clinicName: clinic.name });
      return;
    }

    const roles = await getUserRolesForClinic(req.userId!, Number(clinicId));
    if (roles.length === 0) {
      res.status(403).json({ error: "Forbidden", message: "Sem acesso a esta clínica" });
      return;
    }

    const token = generateToken(req.userId!, roles, Number(clinicId), false, req.userName);
    res.json({ token, clinicId: Number(clinicId), roles });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "Usuário não encontrado" });
      return;
    }

    const clinics = await getUserClinics(user.id);
    const activeClinicId = req.clinicId ?? null;
    const activeClinic = clinics.find((c) => c.id === activeClinicId) ?? null;

    // Plano + features da clínica ativa (para feature-gating no frontend)
    const { getPlanLimits } = await import("../middleware/subscription.js");
    const { resolveFeatures } = await import("@workspace/db");
    const subscription = activeClinicId ? await getPlanLimits(activeClinicId) : null;
    const features = subscription
      ? Array.from(resolveFeatures(subscription.planName))
      : [];

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: activeClinic?.roles ?? req.userRoles ?? [],
      clinicId: activeClinicId,
      isSuperAdmin: user.isSuperAdmin,
      clinics,
      subscription,
      features,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
