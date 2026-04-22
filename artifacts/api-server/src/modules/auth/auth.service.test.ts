import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed-password"),
    compare: vi.fn(async () => true),
  },
}));

vi.mock("../../middleware/auth.js", () => ({
  generateToken: vi.fn(() => "test-token"),
}));

vi.mock("../../utils/dateUtils.js", () => ({
  todayBRT: vi.fn(() => "2026-04-22"),
}));

vi.mock("./auth.repository.js", () => ({
  authRepository: {
    findUserByCpf: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    findPlanByName: vi.fn(),
    findCouponByCode: vi.fn(),
    findClinicById: vi.fn(),
    getUserClinics: vi.fn(),
    getUserRolesForClinic: vi.fn(),
    registerClinicAndUser: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { authService, AuthError } from "./auth.service.js";
import { authRepository } from "./auth.repository.js";
import { generateToken } from "../../middleware/auth.js";

const repo = authRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;
const tokenFn = generateToken as unknown as ReturnType<typeof vi.fn>;
const bcryptCompare = bcrypt.compare as unknown as ReturnType<typeof vi.fn>;

const baseRegister = {
  name: "João",
  cpf: "12345678901",
  email: "joao@example.com",
  password: "secret123",
  clinicName: "Clínica Teste",
  profileType: "clinica" as const,
  planName: "essencial",
  couponCode: null,
};

const mockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  name: "João",
  email: "joao@example.com",
  cpf: "12345678901",
  passwordHash: "stored-hash",
  isSuperAdmin: false,
  createdAt: new Date("2026-04-01T00:00:00Z"),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(repo).forEach((fn) => fn.mockReset());
  tokenFn.mockReturnValue("test-token");
  (bcrypt.hash as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("hashed-password");
  bcryptCompare.mockResolvedValue(true);
});

describe("authService.register", () => {
  it("rejeita CPF inválido", async () => {
    await expect(
      authService.register({ ...baseRegister, cpf: "123" }),
    ).rejects.toMatchObject({ status: 400, code: "Bad Request" });
  });

  it("rejeita CPF duplicado", async () => {
    repo.findUserByCpf.mockResolvedValue([mockUser()]);
    await expect(authService.register(baseRegister)).rejects.toBeInstanceOf(AuthError);
    expect(repo.findUserByCpf).toHaveBeenCalledWith("12345678901");
  });

  it("rejeita e-mail duplicado", async () => {
    repo.findUserByCpf.mockResolvedValue([]);
    repo.findUserByEmail.mockResolvedValue([mockUser()]);
    await expect(authService.register(baseRegister)).rejects.toMatchObject({ status: 400 });
  });

  it("registra clínica nova e devolve token", async () => {
    repo.findUserByCpf.mockResolvedValue([]);
    repo.findUserByEmail.mockResolvedValue([]);
    repo.findPlanByName.mockResolvedValue([{ id: 1, name: "essencial", price: "0", trialDays: 30 }]);
    repo.registerClinicAndUser.mockResolvedValue({
      clinic: { id: 99, name: "Clínica Teste" },
      user: mockUser({ id: 42 }),
    });

    const result = await authService.register(baseRegister);

    expect(bcrypt.hash).toHaveBeenCalledWith("secret123", 10);
    expect(repo.registerClinicAndUser).toHaveBeenCalledWith(
      expect.objectContaining({ cpf: "12345678901", profileType: "clinica" }),
    );
    expect(tokenFn).toHaveBeenCalledWith(42, ["admin"], 99, false, "João");
    expect(result.token).toBe("test-token");
    expect(result.user.roles).toEqual(["admin"]);
    expect(result.clinic).toEqual({ id: 99, name: "Clínica Teste" });
  });

  it("perfil autônomo recebe roles admin + profissional", async () => {
    repo.findUserByCpf.mockResolvedValue([]);
    repo.findUserByEmail.mockResolvedValue([]);
    repo.findPlanByName.mockResolvedValue([]);
    repo.registerClinicAndUser.mockResolvedValue({
      clinic: { id: 5, name: "Solo" },
      user: mockUser({ id: 7 }),
    });

    const result = await authService.register({ ...baseRegister, profileType: "autonomo" });
    expect(result.user.roles).toEqual(["admin", "profissional"]);
    expect(tokenFn).toHaveBeenCalledWith(7, ["admin", "profissional"], 5, false, "João");
  });
});

describe("authService.login", () => {
  it("rejeita identificador inválido", async () => {
    await expect(
      authService.login({ email: "abc", password: "x" } as any),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejeita usuário inexistente", async () => {
    repo.findUserByEmail.mockResolvedValue([]);
    await expect(
      authService.login({ email: "x@y.com", password: "p" } as any),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejeita senha inválida", async () => {
    repo.findUserByEmail.mockResolvedValue([mockUser()]);
    bcryptCompare.mockResolvedValue(false);
    await expect(
      authService.login({ email: "joao@example.com", password: "wrong" } as any),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("superadmin recebe token sem clinicId", async () => {
    repo.findUserByEmail.mockResolvedValue([mockUser({ isSuperAdmin: true })]);
    repo.getUserClinics.mockResolvedValue([{ id: 1, name: "c", roles: ["admin"] }]);
    const result = await authService.login({
      email: "joao@example.com",
      password: "secret",
    } as any);
    expect(result.user.isSuperAdmin).toBe(true);
    expect(result.user.clinicId).toBeNull();
    expect(tokenFn).toHaveBeenCalledWith(10, [], null, true, "João");
  });

  it("usuário sem clínicas é proibido", async () => {
    repo.findUserByEmail.mockResolvedValue([mockUser()]);
    repo.getUserClinics.mockResolvedValue([]);
    await expect(
      authService.login({ email: "joao@example.com", password: "p" } as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("usuário escolhe clinicId preferido", async () => {
    repo.findUserByEmail.mockResolvedValue([mockUser()]);
    repo.getUserClinics.mockResolvedValue([
      { id: 1, name: "A", roles: ["admin"] },
      { id: 2, name: "B", roles: ["profissional"] },
    ]);
    const result = await authService.login({
      email: "joao@example.com",
      password: "p",
      clinicId: 2,
    } as any);
    expect(result.clinic).toEqual({ id: 2, name: "B" });
    expect(result.user.roles).toEqual(["profissional"]);
  });

  it("aceita login por CPF", async () => {
    repo.findUserByCpf.mockResolvedValue([mockUser()]);
    repo.getUserClinics.mockResolvedValue([{ id: 1, name: "A", roles: ["admin"] }]);
    const result = await authService.login({
      email: "12345678901",
      password: "p",
    } as any);
    expect(repo.findUserByCpf).toHaveBeenCalledWith("12345678901");
    expect(result.user.id).toBe(10);
  });
});

describe("authService.switchClinic", () => {
  it("superadmin para null retorna token global", async () => {
    const result = await authService.switchClinic({
      userId: 1,
      userName: "Super",
      isSuperAdmin: true,
      clinicId: null,
    });
    expect(result).toEqual({ token: "test-token", clinicId: null });
    expect(tokenFn).toHaveBeenCalledWith(1, [], null, true, "Super");
  });

  it("badRequest sem clinicId", async () => {
    await expect(
      authService.switchClinic({
        userId: 1,
        userName: "x",
        isSuperAdmin: false,
        clinicId: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("usuário sem acesso à clínica é proibido", async () => {
    repo.getUserRolesForClinic.mockResolvedValue([]);
    await expect(
      authService.switchClinic({
        userId: 1,
        userName: "x",
        isSuperAdmin: false,
        clinicId: 99,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("usuário com acesso recebe token", async () => {
    repo.getUserRolesForClinic.mockResolvedValue(["profissional"]);
    const result = await authService.switchClinic({
      userId: 1,
      userName: "x",
      isSuperAdmin: false,
      clinicId: 99,
    });
    expect(result.clinicId).toBe(99);
    expect(result.roles).toEqual(["profissional"]);
  });

  it("superadmin trocando para clínica específica valida existência", async () => {
    repo.findClinicById.mockResolvedValue([]);
    await expect(
      authService.switchClinic({
        userId: 1,
        userName: "Super",
        isSuperAdmin: true,
        clinicId: 50,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("authService.getMe", () => {
  it("retorna 404 quando usuário não existe", async () => {
    repo.findUserById.mockResolvedValue([]);
    await expect(
      authService.getMe({ userId: 1, activeClinicId: null, fallbackRoles: [] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("retorna info do usuário sem clínica ativa", async () => {
    repo.findUserById.mockResolvedValue([mockUser()]);
    repo.getUserClinics.mockResolvedValue([
      { id: 1, name: "A", roles: ["admin"] },
      { id: 2, name: "B", roles: ["profissional"] },
    ]);
    const result = await authService.getMe({
      userId: 10,
      activeClinicId: null,
      fallbackRoles: ["admin"],
    });
    expect(result.id).toBe(10);
    expect(result.clinicId).toBeNull();
    expect(result.roles).toEqual(["admin"]);
    expect(result.subscription).toBeNull();
    expect(result.features).toEqual([]);
    expect(result.clinics).toHaveLength(2);
  });
});
