import { db } from "../lib/db/src";
import {
  appointmentsTable,
  financialRecordsTable,
  proceduresTable,
  patientsTable,
  clinicsTable,
  usersTable,
  userRolesTable,
  evolutionsTable,
} from "../lib/db/src/schema";
import { eq, and, inArray, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function workingDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cur = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) days.push(cur.toISOString().split("T")[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const PAYMENT_METHODS = ["dinheiro", "pix", "cartao_debito", "cartao_credito", "transferencia"];
const SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","13:00","13:30","14:00","14:30","15:00","15:30","16:00","17:00"];
const EVOLUTION_TEXTS = [
  "Paciente relata melhora significativa da dor. Mobilização articular, alongamento e fortalecimento realizados.",
  "Sessão com foco em ganho de amplitude de movimento. Boa adesão ao protocolo terapêutico.",
  "Exercícios de fortalecimento e estabilização realizados. Evolução dentro do esperado.",
  "Boa resposta ao tratamento. Terapia manual aplicada. EVA reduziu 2 pontos.",
  "Ênfase em propriocepção e equilíbrio. Paciente relata maior autonomia nas AVDs.",
];

async function seed() {
  console.log("🌱 Seed financeiro e agendamentos históricos...\n");

  // Find a clinic with patients and procedures
  const clinics = await db.select().from(clinicsTable).limit(10);
  if (clinics.length === 0) { console.error("No clinics found!"); return; }

  // Use the clinic with the most patients
  const clinicCandidates = await Promise.all(
    clinics.map(async (c) => {
      const [cnt] = await db.select({ count: sql<number>`count(*)` }).from(patientsTable).where(eq(patientsTable.clinicId, c.id));
      return { ...c, patCount: Number(cnt?.count ?? 0) };
    })
  );
  clinicCandidates.sort((a, b) => b.patCount - a.patCount);
  const clinic = clinicCandidates[0];
  const clinicId = clinic.id;
  console.log(`Using clinic: "${clinic.name}" (id=${clinicId}, ${clinic.patCount} patients)`);

  // Get patients and procedures for this clinic
  const patients = await db.select({ id: patientsTable.id, name: patientsTable.name }).from(patientsTable).where(eq(patientsTable.clinicId, clinicId));
  // Procedures may be clinic-specific OR global (clinicId=null)
  const procsOwned = await db.select().from(proceduresTable).where(eq(proceduresTable.clinicId, clinicId));
  const procsGlobal = await db.select().from(proceduresTable).where(sql`${proceduresTable.clinicId} IS NULL`);
  const procs = procsOwned.length > 0 ? procsOwned : procsGlobal;

  if (patients.length === 0 || procs.length === 0) {
    console.error(`No patients (${patients.length}) or procedures (${procs.length}) for clinic ${clinicId}`);
    return;
  }

  // Find professionals for this clinic
  const profRoles = await db.select({ userId: userRolesTable.userId }).from(userRolesTable)
    .where(and(eq(userRolesTable.clinicId, clinicId), inArray(userRolesTable.role, ["profissional", "admin"])));
  const profIds = [...new Set(profRoles.map(r => r.userId))];
  if (profIds.length === 0) profIds.push(patients[0].id); // fallback

  // Check if historical appointments already exist
  const existingAppts = await db.select({ count: sql<number>`count(*)` }).from(appointmentsTable)
    .where(and(eq(appointmentsTable.clinicId, clinicId), eq(appointmentsTable.status, "concluido")));
  const existingCount = Number(existingAppts[0]?.count ?? 0);

  if (existingCount > 50) {
    console.log(`✅ Clinic ${clinicId} already has ${existingCount} concluded appointments, skipping appointment creation.`);
  } else {
    // Create historical appointments: jan–mar 2026
    console.log("\n📅 Creating historical appointments (Jan–Mar 2026)...");
    const pastDays = workingDays("2026-01-05", "2026-03-21");
    const futureDays = workingDays("2026-03-23", "2026-04-15");
    const patIds = patients.map(p => p.id);
    const procList = procs;

    const apptValues: object[] = [];
    const apptMeta: { patIdx: number; procIdx: number; status: string; date: string }[] = [];

    for (const dayStr of pastDays) {
      const numSlots = Math.min(rnd(4, 7), patIds.length);
      const usedSlots = new Set<string>();
      const usedPats = new Set<number>();
      for (let s = 0; s < numSlots; s++) {
        let slot: string; let tries = 0;
        do { slot = pick(SLOTS); tries++; } while (usedSlots.has(slot) && tries < 30);
        let pIdx: number; tries = 0;
        do { pIdx = rnd(0, patIds.length - 1); tries++; } while (usedPats.has(pIdx) && tries < 30);
        usedSlots.add(slot); usedPats.add(pIdx);
        const proc = pick(procList);
        const r = Math.random();
        const status = r < 0.78 ? "concluido" : r < 0.90 ? "faltou" : "cancelado";
        apptValues.push({ patientId: patIds[pIdx], procedureId: proc.id, professionalId: pick(profIds), date: dayStr, startTime: slot, endTime: addMinutes(slot, proc.durationMinutes), status, clinicId });
        apptMeta.push({ patIdx: pIdx, procIdx: procList.indexOf(proc), status, date: dayStr });
      }
    }

    for (const dayStr of futureDays) {
      const numSlots = Math.min(rnd(3, 6), patIds.length);
      const usedSlots = new Set<string>();
      const usedPats = new Set<number>();
      for (let s = 0; s < numSlots; s++) {
        let slot: string; let tries = 0;
        do { slot = pick(SLOTS); tries++; } while (usedSlots.has(slot) && tries < 30);
        let pIdx: number; tries = 0;
        do { pIdx = rnd(0, patIds.length - 1); tries++; } while (usedPats.has(pIdx) && tries < 30);
        usedSlots.add(slot); usedPats.add(pIdx);
        const proc = pick(procList);
        const status = Math.random() < 0.65 ? "agendado" : "confirmado";
        apptValues.push({ patientId: patIds[pIdx], procedureId: proc.id, professionalId: pick(profIds), date: dayStr, startTime: slot, endTime: addMinutes(slot, proc.durationMinutes), status, clinicId });
        apptMeta.push({ patIdx: pIdx, procIdx: procList.indexOf(proc), status, date: dayStr });
      }
    }

    const insertedAppts: any[] = [];
    for (let i = 0; i < apptValues.length; i += 100) {
      const chunk = await db.insert(appointmentsTable).values(apptValues.slice(i, i + 100) as any[]).returning();
      insertedAppts.push(...chunk);
    }
    const concluded = insertedAppts.filter(a => a.status === "concluido");
    console.log(`  ✅ ${insertedAppts.length} appointments (${concluded.length} concluded)`);

    // Create evolutions for concluded appointments
    if (concluded.length > 0) {
      const evoValues = concluded.map((a) => ({
        patientId: a.patientId,
        appointmentId: a.id,
        description: pick(EVOLUTION_TEXTS),
        patientResponse: "Paciente relatou melhora em relação à sessão anterior.",
        clinicalNotes: "Evolução dentro do esperado. Manter protocolo atual.",
        complications: null,
      }));
      for (let i = 0; i < evoValues.length; i += 100) {
        await db.insert(evolutionsTable).values(evoValues.slice(i, i + 100));
      }
      console.log(`  ✅ ${evoValues.length} evolutions`);
    }
  }

  // Now seed financial records for all concluded appointments without records
  console.log("\n💰 Creating financial records...");
  const allConcluded = await db
    .select({ id: appointmentsTable.id, patientId: appointmentsTable.patientId, procedureId: appointmentsTable.procedureId, date: appointmentsTable.date, clinicId: appointmentsTable.clinicId })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.clinicId, clinicId), eq(appointmentsTable.status, "concluido")));

  const existingRec = await db.select({ appointmentId: financialRecordsTable.appointmentId }).from(financialRecordsTable);
  const existingApptIds = new Set(existingRec.map(r => r.appointmentId).filter(Boolean));
  const toSeed = allConcluded.filter(a => !existingApptIds.has(a.id));

  const allProcs = [...procs, ...(procs === procsOwned ? procsGlobal : procsOwned)];
  const procMap = new Map(allProcs.map(p => [p.id, p]));
  const patMap = new Map(patients.map(p => [p.id, p]));

  if (toSeed.length > 0) {
    const recValues = toSeed.map((a) => {
      const proc = procMap.get(a.procedureId!) ?? procs[0];
      const pat = patMap.get(a.patientId) ?? patients[0];
      return {
        type: "receita" as const,
        amount: proc?.price ?? "150.00",
        description: `${proc?.name ?? "Procedimento"} – ${pat?.name ?? "Paciente"}`,
        category: proc?.category ?? "fisioterapia",
        appointmentId: a.id,
        patientId: a.patientId,
        procedureId: a.procedureId,
        paymentDate: a.date,
        paymentMethod: PAYMENT_METHODS[a.id % PAYMENT_METHODS.length],
        transactionType: "pagamento" as const,
        status: "pago" as const,
        clinicId: a.clinicId,
      };
    });
    for (let i = 0; i < recValues.length; i += 100) {
      await db.insert(financialRecordsTable).values(recValues.slice(i, i + 100) as any[]);
    }
    const total = recValues.reduce((s, r) => s + parseFloat(r.amount as string), 0);
    console.log(`  ✅ ${recValues.length} revenue records → R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  } else {
    console.log("  ✅ Revenue records already exist.");
  }

  // Expense records
  const expCount = await db.select({ count: sql<number>`count(*)` }).from(financialRecordsTable)
    .where(and(eq(financialRecordsTable.type, "despesa"), eq(financialRecordsTable.clinicId, clinicId)));
  if (Number(expCount[0]?.count ?? 0) < 10) {
    const EXPENSES = [
      { desc: "Aluguel do consultório", amount: "3500.00", cat: "fixo" },
      { desc: "Conta de luz", amount: "380.00", cat: "fixo" },
      { desc: "Internet e telefone", amount: "220.00", cat: "fixo" },
      { desc: "Materiais de fisioterapia", amount: "450.00", cat: "materiais" },
      { desc: "Marketing digital", amount: "500.00", cat: "marketing" },
      { desc: "Plano de saúde da equipe", amount: "1200.00", cat: "pessoal" },
      { desc: "Contador", amount: "350.00", cat: "pessoal" },
    ];
    const months = [
      { label: "Janeiro/2026", day: "2026-01-05" },
      { label: "Fevereiro/2026", day: "2026-02-03" },
      { label: "Março/2026", day: "2026-03-03" },
    ];
    const expValues = months.flatMap((month, mi) =>
      EXPENSES.map((e) => ({
        type: "despesa" as const,
        amount: e.amount,
        description: `${e.desc} – ${month.label}`,
        category: e.cat,
        paymentDate: month.day,
        paymentMethod: "transferencia",
        clinicId,
      }))
    );
    await db.insert(financialRecordsTable).values(expValues as any[]);
    console.log(`  ✅ ${expValues.length} expense records`);
  } else {
    console.log("  ✅ Expense records already exist.");
  }

  console.log("\n✅ Seed completed!");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => { console.error("❌ Error:", err?.message ?? err); process.exit(1); });
