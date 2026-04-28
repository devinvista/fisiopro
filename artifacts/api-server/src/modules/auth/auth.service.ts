import bcrypt from "bcryptjs";
import type { Role } from "@workspace/db";
import { generateToken } from "../../middleware/auth.js";
import { todayBRT } from "../../utils/dateUtils.js";
import { authRepository } from "./auth.repository.js";
import { generateResetToken, hashToken, passwordResetRepository } from "./password-reset.js";
import { lgpdRepository } from "../lgpd/lgpd.repository.js";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schemas.js";

export class AuthError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const badRequest = (msg: string) => new AuthError(400, "Bad Request", msg);
const unauthorized = (msg = "Credenciais inválidas") =>
  new AuthError(401, "Unauthorized", msg);
const forbidden = (msg: string) => new AuthError(403, "Forbidden", msg);
const notFound = (msg: string) => new AuthError(404, "Not Found", msg);

function normalizeCpf(value: string) {
  return value.replace(/\D/g, "");
}

function isEmail(value: string) {
  return value.includes("@");
}

function isCpf(value: string) {
  return /^\d{11}$/.test(normalizeCpf(value));
}

export const authService = {
  async register(input: RegisterInput & { ip?: string | null; userAgent?: string | null }) {
    const {
      name,
      email,
      cpf,
      password,
      clinicName,
      profileType,
      planName,
      couponCode,
      privacyDocumentId,
      termsDocumentId,
    } = input;
    const normalizedCpf = normalizeCpf(cpf);
    if (normalizedCpf.length !== 11) {
      throw badRequest("CPF inválido. Informe os 11 dígitos.");
    }

    const existingCpf = await authRepository.findUserByCpf(normalizedCpf);
    if (existingCpf.length > 0) throw badRequest("CPF já cadastrado");

    if (email) {
      const existing = await authRepository.findUserByEmail(email);
      if (existing.length > 0) throw badRequest("E-mail já cadastrado");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const planRows = await authRepository.findPlanByName(planName ?? "essencial");
    const selectedPlan = planRows[0] ?? null;

    let coupon: Awaited<ReturnType<typeof authRepository.findCouponByCode>>[number] | null = null;
    if (couponCode) {
      const [found] = await authRepository.findCouponByCode(couponCode);
      if (found && found.isActive) {
        const notExpired = !found.expiresAt || new Date(found.expiresAt) >= new Date();
        const notExhausted = found.maxUses === null || found.usedCount < found.maxUses;
        const planAllowed =
          !found.applicablePlanNames ||
          (found.applicablePlanNames as string[]).length === 0 ||
          (found.applicablePlanNames as string[]).includes(planName ?? "essencial");
        if (notExpired && notExhausted && planAllowed) coupon = found;
      }
    }

    const { clinic, user } = await authRepository.registerClinicAndUser({
      name,
      cpf: normalizedCpf,
      email: email ? email.toLowerCase().trim() : null,
      passwordHash,
      clinicName,
      profileType: profileType ?? "clinica",
      selectedPlan,
      coupon,
      today: todayBRT(),
    });

    const assignedRoles: Role[] =
      profileType === "autonomo" ? ["admin", "profissional"] : ["admin"];

    // LGPD — registra aceite das versões correntes (best-effort: não falha o
    // cadastro se a inserção do aceite der erro pontual)
    const acceptanceIds = [privacyDocumentId, termsDocumentId].filter(
      (id): id is number => typeof id === "number" && id > 0,
    );
    for (const docId of acceptanceIds) {
      try {
        await lgpdRepository.insertAcceptance({
          userId: user.id,
          policyDocumentId: docId,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        });
      } catch (err) {
        console.warn(
          `[auth.register] aceite LGPD doc=${docId} user=${user.id} falhou:`,
          err,
        );
      }
    }

    const token = generateToken(user.id, assignedRoles, clinic.id, false, user.name);

    return {
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
    };
  },

  async login(input: LoginInput) {
    const { email: identifier, password, clinicId: preferredClinicId } = input;
    let user: Awaited<ReturnType<typeof authRepository.findUserByCpf>>[number] | undefined;

    if (isEmail(identifier)) {
      const rows = await authRepository.findUserByEmail(identifier);
      user = rows[0];
    } else if (isCpf(identifier)) {
      const rows = await authRepository.findUserByCpf(normalizeCpf(identifier));
      user = rows[0];
    } else {
      throw unauthorized();
    }

    if (!user) throw unauthorized();

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw unauthorized();

    if (user.isSuperAdmin) {
      const token = generateToken(user.id, [], null, true, user.name);
      const clinics = await authRepository.getUserClinics(user.id);
      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles: [] as Role[],
          clinicId: null,
          isSuperAdmin: true,
          createdAt: user.createdAt,
        },
        clinics,
      };
    }

    const clinics = await authRepository.getUserClinics(user.id);
    if (clinics.length === 0) {
      throw forbidden("Usuário sem acesso a nenhuma clínica");
    }

    let activeClinic = clinics[0];
    if (preferredClinicId) {
      const found = clinics.find((c) => c.id === Number(preferredClinicId));
      if (found) activeClinic = found;
    }

    const token = generateToken(
      user.id,
      activeClinic.roles,
      activeClinic.id,
      false,
      user.name,
    );

    return {
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
    };
  },

  async switchClinic(args: {
    userId: number;
    userName?: string | null;
    isSuperAdmin: boolean;
    clinicId: number | null | undefined;
  }) {
    const { userId, userName, isSuperAdmin, clinicId } = args;

    if (isSuperAdmin && (clinicId === null || clinicId === undefined || clinicId === 0)) {
      const token = generateToken(userId, [], null, true, userName ?? undefined);
      return { token, clinicId: null };
    }

    if (!clinicId) throw badRequest("clinicId é obrigatório");

    if (isSuperAdmin) {
      const [clinic] = await authRepository.findClinicById(Number(clinicId));
      if (!clinic) throw notFound("Clínica não encontrada");
      const token = generateToken(
        userId,
        ["admin"],
        Number(clinicId),
        true,
        userName ?? undefined,
      );
      return { token, clinicId: Number(clinicId), clinicName: clinic.name };
    }

    const roles = await authRepository.getUserRolesForClinic(userId, Number(clinicId));
    if (roles.length === 0) throw forbidden("Sem acesso a esta clínica");

    const token = generateToken(userId, roles, Number(clinicId), false, userName ?? undefined);
    return { token, clinicId: Number(clinicId), roles };
  },

  async requestPasswordReset(input: ForgotPasswordInput, appBaseUrl: string) {
    const email = input.email.toLowerCase().trim();
    const rows = await authRepository.findUserByEmail(email);
    const user = rows[0];

    // Always respond the same to prevent email enumeration.
    if (!user) {
      return { ok: true as const, devResetUrl: null };
    }

    const { rawToken, tokenHash } = generateResetToken();
    await passwordResetRepository.createToken(user.id, tokenHash);

    const resetUrl = `${appBaseUrl.replace(/\/$/, "")}/redefinir-senha?token=${rawToken}`;

    // Dev: log so the developer can click the link without email.
    console.log(
      `[auth] Password reset requested for ${email}\n        Reset URL (válido por 1h): ${resetUrl}`,
    );

    // Only return the URL in non-production to support local testing.
    const devResetUrl = process.env.NODE_ENV === "production" ? null : resetUrl;
    return { ok: true as const, devResetUrl };
  },

  async resetPassword(input: ResetPasswordInput) {
    const tokenHash = hashToken(input.token);
    const row = await passwordResetRepository.findActiveByHash(tokenHash);
    if (!row) {
      throw badRequest("Token inválido ou expirado. Solicite um novo link.");
    }
    await passwordResetRepository.updateUserPassword(row.userId, input.password);
    await passwordResetRepository.invalidateAllForUser(row.userId);
    return { ok: true as const };
  },

  async getMe(args: {
    userId: number;
    activeClinicId: number | null;
    fallbackRoles: Role[] | undefined;
  }) {
    const [user] = await authRepository.findUserById(args.userId);
    if (!user) throw notFound("Usuário não encontrado");

    const clinics = await authRepository.getUserClinics(user.id);
    const activeClinic = clinics.find((c) => c.id === args.activeClinicId) ?? null;

    const { getPlanLimits } = await import("../../middleware/subscription.js");
    const subscription = args.activeClinicId ? await getPlanLimits(args.activeClinicId) : null;
    // `features` já vem resolvida pelo middleware (DB jsonb → fallback hardcoded),
    // garantindo coerência server↔client e tornando o catálogo configurável via UI.
    const features = subscription?.features ?? [];

    // LGPD — calcula políticas pendentes para este usuário
    const [currentPolicies, acceptances] = await Promise.all([
      lgpdRepository.listAllCurrent(),
      lgpdRepository.findUserAcceptances(user.id),
    ]);
    const acceptedIds = new Set(acceptances.map((a) => a.policyDocumentId));
    const pendingPolicies = currentPolicies
      .filter((doc) => !acceptedIds.has(doc.id))
      .map((doc) => ({
        id: doc.id,
        type: doc.type,
        version: doc.version,
        title: doc.title,
      }));

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: activeClinic?.roles ?? args.fallbackRoles ?? [],
      clinicId: args.activeClinicId,
      isSuperAdmin: user.isSuperAdmin,
      clinics,
      subscription,
      features,
      createdAt: user.createdAt,
      lgpd: {
        pendingPolicies,
        hasPending: pendingPolicies.length > 0,
      },
    };
  },
};
