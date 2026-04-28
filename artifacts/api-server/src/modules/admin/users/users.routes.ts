import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, userRolesTable } from "@workspace/db";
import type { Role } from "@workspace/db";
import { eq, and, isNotNull, count } from "drizzle-orm";
import { authMiddleware, AuthRequest } from "../../../middleware/auth.js";
import { requirePermission } from "../../../middleware/rbac.js";
import { requireActiveSubscription, enforceLimit, getPlanLimits } from "../../../middleware/subscription.js";
import { validateBody } from "../../../utils/validate.js";
import { z } from "zod/v4";

const rolesEnum = z.enum(["admin", "profissional", "secretaria"]);

const createUserSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(200),
  cpf: z.string().min(1, "CPF é obrigatório"),
  email: z.email("E-mail inválido").optional().nullable(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  roles: z.array(rolesEnum).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cpf: z.string().optional(),
  email: z.email("E-mail inválido").optional().nullable(),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres").optional(),
  roles: z.array(rolesEnum).optional(),
});

const router = Router();
router.use(authMiddleware);
router.use(requireActiveSubscription());

async function getUserWithRolesForClinic(userId: number, clinicId: number | null) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) return null;

  const roleRows = clinicId
    ? await db
        .select({ role: userRolesTable.role })
        .from(userRolesTable)
        .where(and(eq(userRolesTable.userId, userId), eq(userRolesTable.clinicId, clinicId)))
    : await db
        .select({ role: userRolesTable.role })
        .from(userRolesTable)
        .where(eq(userRolesTable.userId, userId));

  return {
    id: user.id,
    name: user.name,
    cpf: user.cpf,
    email: user.email,
    roles: roleRows.map((r) => r.role as Role),
    clinicId: user.clinicId,
    createdAt: user.createdAt,
  };
}

router.get("/professionals", async (req: AuthRequest, res) => {
  try {
    const clinicId = req.clinicId;
    if (!clinicId) { res.json([]); return; }

    const rows = await db
      .select({
        userId: userRolesTable.userId,
        name: usersTable.name,
        role: userRolesTable.role,
      })
      .from(userRolesTable)
      .innerJoin(usersTable, eq(userRolesTable.userId, usersTable.id))
      .where(eq(userRolesTable.clinicId, clinicId));

    const userMap = new Map<number, { id: number; name: string; roles: string[] }>();
    for (const row of rows) {
      if (!userMap.has(row.userId)) {
        userMap.set(row.userId, { id: row.userId, name: row.name, roles: [] });
      }
      userMap.get(row.userId)!.roles.push(row.role);
    }
    res.json(Array.from(userMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/", requirePermission("users.manage"), async (req: AuthRequest, res) => {
  try {
    if (req.isSuperAdmin || !req.clinicId) {
      const rows = await db
        .select({
          id: usersTable.id,
          name: usersTable.name,
          cpf: usersTable.cpf,
          email: usersTable.email,
          clinicId: usersTable.clinicId,
          createdAt: usersTable.createdAt,
          role: userRolesTable.role,
        })
        .from(usersTable)
        .leftJoin(userRolesTable, eq(userRolesTable.userId, usersTable.id))
        .orderBy(usersTable.name);

      const superAdminMap = new Map<number, { id: number; name: string; cpf: string; email: string | null; roles: Role[]; clinicId: number | null; createdAt: Date }>();
      for (const row of rows) {
        if (!superAdminMap.has(row.id)) {
          superAdminMap.set(row.id, { id: row.id, name: row.name, cpf: row.cpf, email: row.email, roles: [], clinicId: row.clinicId, createdAt: row.createdAt });
        }
        if (row.role) superAdminMap.get(row.id)!.roles.push(row.role as Role);
      }
      res.json(Array.from(superAdminMap.values()));
      return;
    }

    const clinicId = req.clinicId;
    const rows = await db
      .select({
        userId: userRolesTable.userId,
        role: userRolesTable.role,
        name: usersTable.name,
        cpf: usersTable.cpf,
        email: usersTable.email,
        createdAt: usersTable.createdAt,
      })
      .from(userRolesTable)
      .innerJoin(usersTable, eq(userRolesTable.userId, usersTable.id))
      .where(eq(userRolesTable.clinicId, clinicId));

    const userMap = new Map<number, { id: number; name: string; cpf: string; email: string | null; roles: Role[]; clinicId: number; createdAt: Date }>();
    for (const row of rows) {
      if (!userMap.has(row.userId)) {
        userMap.set(row.userId, { id: row.userId, name: row.name, cpf: row.cpf, email: row.email, roles: [], clinicId, createdAt: row.createdAt });
      }
      userMap.get(row.userId)!.roles.push(row.role as Role);
    }

    res.json(Array.from(userMap.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post(
  "/",
  requirePermission("users.manage"),
  enforceLimit("users"),
  enforceLimit("professionals", {
    when: (req) => {
      const roles = (req.body as { roles?: unknown })?.roles;
      const list = Array.isArray(roles) && roles.length > 0 ? (roles as string[]) : ["profissional"];
      return list.includes("profissional");
    },
  }),
  async (req: AuthRequest, res) => {
  try {
    const body = validateBody(createUserSchema, req.body, res);
    if (!body) return;
    const { name, cpf, email, password, roles } = body;
    const roleList: Role[] = Array.isArray(roles) && roles.length > 0 ? roles as Role[] : ["profissional"];

    const normalizedCpf = cpf.replace(/\D/g, "");
    const existingCpf = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.cpf, normalizedCpf))
      .limit(1);

    let user = existingCpf[0];

    if (!user) {
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
      const [newUser] = await db
        .insert(usersTable)
        .values({
          name,
          cpf: normalizedCpf,
          email: email ? email.toLowerCase().trim() : null,
          passwordHash,
          clinicId: req.clinicId ?? null,
        })
        .returning();
      user = newUser;
    }

    const clinicId = req.clinicId ?? null;
    if (clinicId) {
      const existing = await db
        .select()
        .from(userRolesTable)
        .where(and(eq(userRolesTable.userId, user.id), eq(userRolesTable.clinicId, clinicId)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(userRolesTable).values(
          roleList.map((role) => ({ userId: user.id, clinicId, role }))
        );
      } else {
        await db.delete(userRolesTable).where(
          and(eq(userRolesTable.userId, user.id), eq(userRolesTable.clinicId, clinicId))
        );
        await db.insert(userRolesTable).values(
          roleList.map((role) => ({ userId: user.id, clinicId, role }))
        );
      }
    } else {
      await db.insert(userRolesTable).values(roleList.map((role) => ({ userId: user.id, role })));
    }

    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      roles: roleList,
      clinicId,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.put("/:id", requirePermission("users.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    const body = validateBody(updateUserSchema, req.body, res);
    if (!body) return;
    const { name, cpf, email, roles, password } = body;

    const updateData: Record<string, unknown> = {};
    if (name) updateData.name = name;
    if (cpf) updateData.cpf = cpf.replace(/\D/g, "");
    if (email !== undefined) updateData.email = email ? email.toLowerCase().trim() : null;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "Not Found", message: "Usuário não encontrado" });
      return;
    }

    if (Array.isArray(roles)) {
      const clinicId = req.clinicId ?? null;

      // Verificar limite de profissionais ao atribuir role "profissional"
      if (clinicId && !req.isSuperAdmin && (roles as string[]).includes("profissional")) {
        // Checar se o usuário já tem a role "profissional" (nesse caso não consome nova vaga)
        const [existingProRole] = await db
          .select()
          .from(userRolesTable)
          .where(and(eq(userRolesTable.userId, id), eq(userRolesTable.clinicId, clinicId), eq(userRolesTable.role, "profissional")))
          .limit(1);

        if (!existingProRole) {
          const limits = await getPlanLimits(clinicId);
          if (limits?.maxProfessionals != null) {
            const [{ total }] = await db
              .select({ total: count() })
              .from(userRolesTable)
              .where(and(eq(userRolesTable.clinicId, clinicId), eq(userRolesTable.role, "profissional")));
            if (Number(total) >= limits.maxProfessionals) {
              res.status(403).json({
                error: "Plan Limit Reached",
                limitReached: true,
                resource: "professionals",
                limit: limits.maxProfessionals,
                current: Number(total),
                message: `Limite de ${limits.maxProfessionals} profissional(is) do seu plano atingido. Faça upgrade para adicionar mais profissionais.`,
              });
              return;
            }
          }
        }
      }

      if (clinicId) {
        await db.delete(userRolesTable).where(
          and(eq(userRolesTable.userId, id), eq(userRolesTable.clinicId, clinicId))
        );
        if (roles.length > 0) {
          await db.insert(userRolesTable).values(
            (roles as Role[]).map((role) => ({ userId: id, clinicId, role }))
          );
        }
      } else {
        await db.delete(userRolesTable).where(eq(userRolesTable.userId, id));
        if (roles.length > 0) {
          await db.insert(userRolesTable).values(
            (roles as Role[]).map((role) => ({ userId: id, role }))
          );
        }
      }
    }

    const result = await getUserWithRolesForClinic(id, req.clinicId ?? null);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/:id", requirePermission("users.manage"), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);

    if (id === req.userId) {
      res.status(400).json({ error: "Bad Request", message: "Você não pode excluir sua própria conta" });
      return;
    }

    if (req.clinicId) {
      await db.delete(userRolesTable).where(
        and(eq(userRolesTable.userId, id), eq(userRolesTable.clinicId, req.clinicId))
      );
    } else {
      await db.delete(usersTable).where(eq(usersTable.id, id));
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
