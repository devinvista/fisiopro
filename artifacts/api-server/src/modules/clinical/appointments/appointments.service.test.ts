import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(() => selectChain),
    leftJoin: vi.fn(() => selectChain),
    where: vi.fn(() => selectChain),
    orderBy: vi.fn(() => Promise.resolve([])),
    limit: vi.fn(() => Promise.resolve([])),
  };
  return {
    selectChain,
    select: vi.fn(() => selectChain),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: dbMock.select,
    insert: dbMock.insert,
    update: dbMock.update,
    delete: dbMock.delete,
    transaction: vi.fn(),
  },
  appointmentsTable: {},
  patientsTable: {},
  proceduresTable: { id: "id" },
  blockedSlotsTable: {},
  schedulesTable: { id: "id" },
  clinicsTable: {},
  financialRecordsTable: {},
  sessionCreditsTable: {},
  patientPackagesTable: {},
  packagesTable: {},
  patientSubscriptionsTable: {},
  patientWalletTable: {},
  patientWalletTransactionsTable: {},
  procedureCostsTable: {},
  resolvePermissions: vi.fn(() => new Set<string>()),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  gt: vi.fn(),
  ne: vi.fn(),
  desc: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

vi.mock("./appointments.repository.js", () => ({
  getWithDetails: vi.fn(),
  checkConflict: vi.fn(),
  resolveMonthlyPackageCreditPolicy: vi.fn(),
  countAbsenceCreditsInMonth: vi.fn(),
}));

vi.mock("./appointments.billing.js", () => ({
  applyBillingRules: vi.fn(),
}));

vi.mock("../../../utils/auditLog.js", () => ({ logAudit: vi.fn() }));
vi.mock("../../../utils/dateUtils.js", () => ({ todayBRT: vi.fn(() => "2026-04-22") }));
vi.mock("../medical-records/medical-records.repository.js", () => ({
  ensureAutoEvolutionForAppointment: vi.fn(),
}));

const repo = await import("./appointments.repository.js");
const svc = await import("./appointments.service.js");
const { AppointmentError } = await import("./appointments.errors.js");

const ctx = {
  userId: 1,
  userName: "Tester",
  userRoles: [] as any[],
  isSuperAdmin: false,
  clinicId: 10,
};

describe("appointments.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAvailableSlots", () => {
    it("throws BadRequest when date is missing", async () => {
      await expect(
        svc.getAvailableSlots({ procedureId: 1 }, ctx)
      ).rejects.toMatchObject({ httpStatus: 400, code: "BadRequest" });
    });

    it("throws BadRequest when procedureId is missing", async () => {
      await expect(
        svc.getAvailableSlots({ date: "2026-04-22" }, ctx)
      ).rejects.toBeInstanceOf(AppointmentError);
    });
  });

  describe("getAppointment", () => {
    it("throws NotFound when repository returns null", async () => {
      (repo.getWithDetails as any).mockResolvedValueOnce(null);
      await expect(svc.getAppointment(99, ctx)).rejects.toMatchObject({
        httpStatus: 404, code: "Not Found",
      });
    });

    it("returns details when found", async () => {
      const row = { id: 1, status: "agendado", patientId: 5 };
      (repo.getWithDetails as any).mockResolvedValueOnce(row);
      const result = await svc.getAppointment(1, ctx);
      expect(result).toBe(row);
    });
  });

  describe("updateAppointment", () => {
    it("throws InvalidTransition when state machine rejects move", async () => {
      (repo.getWithDetails as any).mockResolvedValueOnce({
        id: 1, status: "concluido", patientId: 5, date: "2026-04-22", startTime: "09:00",
        procedureId: 2, scheduleId: null,
      });
      await expect(
        svc.updateAppointment(1, { status: "agendado" }, ctx)
      ).rejects.toMatchObject({ code: "InvalidTransition", httpStatus: 422 });
    });

    it("throws NotFound when appointment does not exist", async () => {
      (repo.getWithDetails as any).mockResolvedValueOnce(null);
      await expect(
        svc.updateAppointment(99, { notes: "x" }, ctx)
      ).rejects.toMatchObject({ httpStatus: 404 });
    });
  });

  describe("AppointmentError", () => {
    it("preserves httpStatus, code, message and extra", () => {
      const err = new AppointmentError(409, "Conflict", "boom", { foo: "bar" });
      expect(err.httpStatus).toBe(409);
      expect(err.code).toBe("Conflict");
      expect(err.message).toBe("boom");
      expect(err.extra).toEqual({ foo: "bar" });
      expect(err).toBeInstanceOf(Error);
    });
  });
});
