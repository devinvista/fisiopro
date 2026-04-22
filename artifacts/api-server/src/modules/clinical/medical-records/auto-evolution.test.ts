import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => {
  const insertReturning = vi.fn();
  const selectLimit = vi.fn();
  return {
    insertReturning,
    selectLimit,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: selectLimit,
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: insertReturning,
        })),
      })),
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: dbMock.db,
  evolutionsTable: { id: "id", patientId: "patient_id", appointmentId: "appointment_id" },
  patientsTable: {},
  appointmentsTable: {},
  anamnesisTable: {},
  evaluationsTable: {},
  bodyMeasurementsTable: {},
  treatmentPlansTable: {},
  treatmentPlanProceduresTable: {},
  dischargeSummariesTable: {},
  attestationsTable: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ a, b })),
  and: vi.fn((...args) => ({ and: args })),
  desc: vi.fn((c) => ({ desc: c })),
  sql: vi.fn(),
}));

const { ensureAutoEvolutionForAppointment } = await import("./medical-records.repository.js");

describe("ensureAutoEvolutionForAppointment", () => {
  beforeEach(() => {
    dbMock.insertReturning.mockReset();
    dbMock.selectLimit.mockReset();
    dbMock.db.insert.mockClear();
    dbMock.db.select.mockClear();
  });

  it("creates a stub evolution when none exists for the appointment", async () => {
    dbMock.selectLimit.mockResolvedValueOnce([]);
    dbMock.insertReturning.mockResolvedValueOnce([
      { id: 99, patientId: 1, appointmentId: 42, description: "stub", sessionDuration: 50 },
    ]);

    const result = await ensureAutoEvolutionForAppointment(1, 42, 50);

    expect(result).toEqual(
      expect.objectContaining({ id: 99, appointmentId: 42, sessionDuration: 50 })
    );
    expect(dbMock.db.insert).toHaveBeenCalledTimes(1);
  });

  it("returns null and does not insert when an evolution already exists", async () => {
    dbMock.selectLimit.mockResolvedValueOnce([{ id: 7 }]);

    const result = await ensureAutoEvolutionForAppointment(1, 42);

    expect(result).toBeNull();
    expect(dbMock.db.insert).not.toHaveBeenCalled();
  });

  it("accepts null/undefined sessionDuration", async () => {
    dbMock.selectLimit.mockResolvedValueOnce([]);
    dbMock.insertReturning.mockResolvedValueOnce([
      { id: 100, patientId: 2, appointmentId: 50, sessionDuration: null },
    ]);

    const result = await ensureAutoEvolutionForAppointment(2, 50);

    expect(result).toEqual(expect.objectContaining({ id: 100, sessionDuration: null }));
  });
});
