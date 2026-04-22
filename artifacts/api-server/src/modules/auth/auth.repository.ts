import { db } from "@workspace/db";
import {
  clinicSubscriptionsTable,
  clinicsTable,
  couponUsesTable,
  couponsTable,
  subscriptionPlansTable,
  userRolesTable,
  usersTable,
  type Role,
} from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

export const authRepository = {
  findUserByCpf(cpf: string) {
    return db.select().from(usersTable).where(eq(usersTable.cpf, cpf)).limit(1);
  },

  findUserByEmail(email: string) {
    return db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase().trim()))
      .limit(1);
  },

  findUserById(id: number) {
    return db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  },

  findPlanByName(name: string) {
    return db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.name, name))
      .limit(1);
  },

  findCouponByCode(code: string) {
    return db
      .select()
      .from(couponsTable)
      .where(eq(couponsTable.code, code.toUpperCase().trim()))
      .limit(1);
  },

  findClinicById(id: number) {
    return db.select().from(clinicsTable).where(eq(clinicsTable.id, id)).limit(1);
  },

  async getUserClinics(userId: number) {
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
  },

  async getUserRolesForClinic(userId: number, clinicId: number | null): Promise<Role[]> {
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
  },

  // Transactional registration: clinic + user + roles + subscription + coupon usage.
  registerClinicAndUser(input: {
    name: string;
    cpf: string;
    email: string | null;
    passwordHash: string;
    clinicName: string;
    profileType: "clinica" | "autonomo";
    selectedPlan: typeof subscriptionPlansTable.$inferSelect | null;
    coupon: typeof couponsTable.$inferSelect | null;
    today: string;
  }) {
    return db.transaction(async (tx) => {
      const [clinic] = await tx
        .insert(clinicsTable)
        .values({ name: input.clinicName.trim() })
        .returning();

      const [user] = await tx
        .insert(usersTable)
        .values({
          name: input.name,
          cpf: input.cpf,
          email: input.email,
          passwordHash: input.passwordHash,
          clinicId: clinic.id,
        })
        .returning();

      const rolesToInsert: { userId: number; clinicId: number; role: Role }[] = [
        { userId: user.id, clinicId: clinic.id, role: "admin" },
      ];
      if (input.profileType === "autonomo") {
        rolesToInsert.push({ userId: user.id, clinicId: clinic.id, role: "profissional" });
      }
      await tx.insert(userRolesTable).values(rolesToInsert);

      if (input.selectedPlan) {
        const plan = input.selectedPlan;
        const baseDays = plan.trialDays ?? 30;
        let extraDays = 0;
        let discountedAmount = Number(plan.price);
        let discountApplied = 0;

        if (input.coupon) {
          if (input.coupon.discountType === "percent") {
            const pct = Number(input.coupon.discountValue);
            discountApplied = (discountedAmount * pct) / 100;
            discountedAmount = Math.max(0, discountedAmount - discountApplied);
            extraDays = Math.round((baseDays * pct) / 100);
          } else {
            discountApplied = Number(input.coupon.discountValue);
            discountedAmount = Math.max(0, discountedAmount - discountApplied);
            extraDays = Math.round((discountApplied / Number(plan.price)) * baseDays);
          }
        }

        const trialEnd = new Date(input.today);
        trialEnd.setDate(trialEnd.getDate() + baseDays + extraDays);

        const [sub] = await tx
          .insert(clinicSubscriptionsTable)
          .values({
            clinicId: clinic.id,
            planId: plan.id,
            status: "trial",
            trialStartDate: input.today,
            trialEndDate: trialEnd.toISOString().split("T")[0],
            amount: String(discountedAmount),
            paymentStatus: "pending",
            notes: input.coupon
              ? `Cupom aplicado: ${input.coupon.code} (desconto: R$ ${discountApplied.toFixed(2)})`
              : null,
          })
          .returning();

        if (input.coupon) {
          await tx.insert(couponUsesTable).values({
            couponId: input.coupon.id,
            clinicId: clinic.id,
            subscriptionId: sub.id,
            discountApplied: String(discountApplied),
            extraTrialDays: extraDays,
          });
          await tx
            .update(couponsTable)
            .set({ usedCount: (input.coupon.usedCount ?? 0) + 1, updatedAt: new Date() })
            .where(eq(couponsTable.id, input.coupon.id));
        }
      }

      return { clinic, user };
    });
  },
};
