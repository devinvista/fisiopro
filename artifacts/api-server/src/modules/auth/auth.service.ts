import bcrypt from "bcryptjs";
import type { Role } from "@workspace/db";
import { generateToken } from "../../middleware/auth.js";
import { todayBRT } from "../../utils/dateUtils.js";
import { authRepository } from "./auth.repository.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

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
  async register(input: RegisterInput) {
    const { name, email, cpf, password, clinicName, profileType, planName, couponCode } = input;
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
    const { resolveFeatures } = await import("@workspace/db");
    const subscription = args.activeClinicId ? await getPlanLimits(args.activeClinicId) : null;
    const features = subscription
      ? Array.from(resolveFeatures(subscription.planName))
      : [];

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
    };
  },
};
