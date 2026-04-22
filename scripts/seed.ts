import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../lib/db/src/schema/index.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function seed() {
  console.log("Seeding database...");

  const passwordHash = await bcrypt.hash("demo123", 10);
  await db.insert(schema.usersTable).values({
    name: "Demo Usuário",
    email: "demo@fisiogest.com",
    passwordHash,
    role: "admin",
  }).onConflictDoNothing();
  console.log("✓ Usuário demo: demo@fisiogest.com / demo123");

  const procedures = await db.insert(schema.proceduresTable).values([
    { name: "Fisioterapia Ortopédica", category: "fisioterapia", durationMinutes: 60, price: "180.00", cost: "30.00", description: "Tratamento de lesões ortopédicas" },
    { name: "Pilates Clínico", category: "pilates", durationMinutes: 55, price: "120.00", cost: "20.00", description: "Pilates terapêutico em aparelho" },
    { name: "RPG - Reeducação Postural", category: "fisioterapia", durationMinutes: 50, price: "160.00", cost: "25.00", description: "Reeducação postural global" },
    { name: "Drenagem Linfática", category: "estetica", durationMinutes: 60, price: "130.00", cost: "15.00", description: "Massagem para drenagem linfática" },
    { name: "Acupuntura", category: "fisioterapia", durationMinutes: 45, price: "140.00", cost: "20.00", description: "Tratamento por acupuntura" },
    { name: "Pilates em Grupo", category: "pilates", durationMinutes: 60, price: "80.00", cost: "10.00", description: "Aula em grupo de até 4 pessoas" },
    { name: "Massoterapia", category: "estetica", durationMinutes: 60, price: "110.00", cost: "15.00", description: "Massagem terapêutica" },
    { name: "Eletroterapia (TENS/FES)", category: "fisioterapia", durationMinutes: 40, price: "90.00", cost: "10.00", description: "Estimulação elétrica transcutânea" },
  ]).returning();
  console.log(`✓ ${procedures.length} procedimentos criados`);

  const patients = await db.insert(schema.patientsTable).values([
    { name: "Ana Carolina Silva", cpf: "111.222.333-44", birthDate: "1985-03-14", phone: "(11) 99111-2222", email: "ana.silva@email.com", address: "Rua das Flores, 120 - São Paulo", profession: "Professora", notes: "Dor lombar crônica" },
    { name: "Roberto Ferreira", cpf: "222.333.444-55", birthDate: "1972-07-22", phone: "(11) 98222-3333", email: "roberto.f@email.com", address: "Av. Paulista, 500 - São Paulo", profession: "Engenheiro", notes: "Pós-operatório de joelho" },
    { name: "Mariana Souza", cpf: "333.444.555-66", birthDate: "1990-11-08", phone: "(11) 97333-4444", email: "mariana.s@email.com", profession: "Nutricionista", notes: "Escoliose" },
    { name: "Carlos Andrade", cpf: "444.555.666-77", birthDate: "1968-01-30", phone: "(11) 96444-5555", email: "carlos.a@email.com", address: "Rua Augusta, 800 - São Paulo", profession: "Médico", notes: "Cervicalgia e tensão muscular" },
    { name: "Fernanda Lima", cpf: "555.666.777-88", birthDate: "1995-05-19", phone: "(11) 95555-6666", email: "fernanda.l@email.com", profession: "Advogada", notes: "Tendinite no ombro direito" },
    { name: "João Pedro Oliveira", cpf: "666.777.888-99", birthDate: "1988-09-03", phone: "(11) 94666-7777", email: "joao.oliveira@email.com", address: "Rua Oscar Freire, 200 - São Paulo", profession: "Designer", notes: "LER/DORT" },
    { name: "Patrícia Costa", cpf: "777.888.999-00", birthDate: "1978-12-25", phone: "(11) 93777-8888", email: "patricia.c@email.com", profession: "Empresária", notes: "Coxartrose inicial" },
    { name: "Diego Santos", cpf: "888.999.000-11", birthDate: "1999-06-11", phone: "(11) 92888-9999", email: "diego.s@email.com", profession: "Estudante", notes: "Pós lesão de tornozelo" },
    { name: "Luciana Mendes", cpf: "999.000.111-22", birthDate: "1982-04-07", phone: "(11) 91999-0000", email: "luciana.m@email.com", address: "Rua Consolação, 350 - São Paulo", profession: "Fisioterapeuta", notes: "Hérnia de disco L4-L5" },
    { name: "Rodrigo Becker", cpf: "000.111.222-33", birthDate: "1975-08-17", phone: "(11) 90000-1111", email: "rodrigo.b@email.com", profession: "Piloto", notes: "Desequilíbrio muscular" },
  ]).returning();
  console.log(`✓ ${patients.length} pacientes criados`);

  const apptValues: schema.InsertAppointment[] = [];

  for (let daysBack = 90; daysBack >= 1; daysBack--) {
    if (Math.random() > 0.45) continue;
    const d = daysAgo(daysBack);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const ds = dateStr(d);
    const startHour = 8 + Math.floor(Math.random() * 8);
    const startTime = `${String(startHour).padStart(2, "0")}:00`;
    const patient = patients[Math.floor(Math.random() * patients.length)];
    const proc = procedures[Math.floor(Math.random() * procedures.length)];
    const endHour = startHour + Math.ceil(proc.durationMinutes / 60);
    const endTime = `${String(endHour).padStart(2, "0")}:00`;
    const statusRoll = Math.random();
    const status = statusRoll < 0.78 ? "concluido" : statusRoll < 0.90 ? "cancelado" : "faltou";
    apptValues.push({ patientId: patient.id, procedureId: proc.id, date: ds, startTime, endTime, status });
  }

  const slots = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
  for (let daysFwd = 0; daysFwd <= 14; daysFwd++) {
    const d = new Date();
    d.setDate(d.getDate() + daysFwd);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const ds = dateStr(d);
    const dailyCount = daysFwd === 0 ? 4 : 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < Math.min(dailyCount, slots.length); i++) {
      const startTime = slots[i];
      const patient = patients[Math.floor(Math.random() * patients.length)];
      const proc = procedures[Math.floor(Math.random() * procedures.length)];
      const endHour = parseInt(startTime.split(":")[0]) + Math.ceil(proc.durationMinutes / 60);
      const endTime = `${String(endHour).padStart(2, "0")}:00`;
      const status = daysFwd === 0 && i < 2 ? "concluido" : daysFwd === 0 && i === 2 ? "confirmado" : "agendado";
      apptValues.push({ patientId: patient.id, procedureId: proc.id, date: ds, startTime, endTime, status });
    }
  }

  const appointments = await db.insert(schema.appointmentsTable).values(apptValues).returning();
  console.log(`✓ ${appointments.length} agendamentos criados`);

  const financialValues: schema.InsertFinancialRecord[] = [];

  for (const appt of appointments) {
    if (appt.status !== "concluido") continue;
    const proc = procedures.find(p => p.id === appt.procedureId);
    if (!proc) continue;
    const patient = patients.find(p => p.id === appt.patientId);
    financialValues.push({
      type: "receita",
      amount: proc.price,
      description: `${proc.name} - ${patient?.name ?? "Paciente"}`,
      category: proc.category,
      appointmentId: appt.id,
    });
  }

  const expenses = [
    { description: "Aluguel da clínica", amount: "3500.00", category: "fixo" },
    { description: "Energia elétrica", amount: "280.00", category: "fixo" },
    { description: "Internet e telefone", amount: "150.00", category: "fixo" },
    { description: "Material de consumo", amount: "420.00", category: "consumo" },
    { description: "Limpeza e higiene", amount: "180.00", category: "consumo" },
    { description: "Software e sistemas", amount: "99.00", category: "fixo" },
    { description: "Marketing digital", amount: "350.00", category: "marketing" },
    { description: "Manutenção de equipamentos", amount: "250.00", category: "equipamento" },
  ];

  for (let m = 0; m < 3; m++) {
    for (const exp of expenses) {
      financialValues.push({ type: "despesa", amount: exp.amount, description: exp.description, category: exp.category });
    }
  }

  if (financialValues.length > 0) {
    const inserted = await db.insert(schema.financialRecordsTable).values(financialValues).returning();
    console.log(`✓ ${inserted.length} registros financeiros criados`);
  }

  console.log("\n✅ Seed concluído com sucesso!");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
