import { db } from "../lib/db/src";
import {
  usersTable,
  patientsTable,
  proceduresTable,
  appointmentsTable,
  financialRecordsTable,
  userRolesTable,
  clinicsTable,
  anamnesisTable,
  evaluationsTable,
  treatmentPlansTable,
  evolutionsTable,
  dischargeSummariesTable,
} from "../lib/db/src/schema";
import bcrypt from "bcryptjs";

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (d: Date) => d.toISOString().split("T")[0];

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

// ── Dados mestres ──────────────────────────────────────────────────────────
const USERS = [
  { name: "Admin Sistema",    cpf: "00000000001", email: "admin@fisiogest.com.br",      password: "123456", roles: ["admin"] },
  { name: "Dra. Mariana Costa", cpf: "00000000002", email: "fisio@fisiogest.com.br",    password: "123456", roles: ["profissional"] },
  { name: "Dr. Rodrigo Alves", cpf: "00000000003", email: "rodrigo@fisiogest.com.br",   password: "123456", roles: ["profissional"] },
  { name: "Maria Secretária", cpf: "00000000004", email: "secretaria@fisiogest.com.br", password: "123456", roles: ["secretaria"] },
  { name: "Dra. Marta Oliveira", cpf: "00000000005", email: "marta@fisiogest.com.br",   password: "123456", roles: ["admin", "profissional"] },
];

const PROCS = [
  { name: "Fisioterapia Ortopédica",       category: "fisioterapia", durationMinutes: 60, price: "180.00", cost: "40.00", maxCapacity: 1, description: "Tratamento de lesões músculo-esqueléticas" },
  { name: "Fisioterapia Neurológica",      category: "fisioterapia", durationMinutes: 60, price: "200.00", cost: "45.00", maxCapacity: 1, description: "Reabilitação neurológica e motora" },
  { name: "RPG – Reeducação Postural",     category: "pilates",      durationMinutes: 60, price: "160.00", cost: "35.00", maxCapacity: 4, description: "Correção postural global" },
  { name: "Pilates Clínico Individual",    category: "pilates",      durationMinutes: 55, price: "150.00", cost: "30.00", maxCapacity: 1, description: "Pilates terapêutico individual" },
  { name: "Pilates em Grupo",              category: "pilates",      durationMinutes: 55, price: "90.00",  cost: "20.00", maxCapacity: 8, description: "Pilates em turma reduzida" },
  { name: "Drenagem Linfática",            category: "estetica",     durationMinutes: 60, price: "140.00", cost: "30.00", maxCapacity: 1, description: "Drenagem linfática manual" },
  { name: "Massagem Relaxante",            category: "estetica",     durationMinutes: 60, price: "120.00", cost: "25.00", maxCapacity: 1, description: "Massagem terapêutica relaxante" },
  { name: "Radiofrequência",               category: "estetica",     durationMinutes: 45, price: "180.00", cost: "40.00", maxCapacity: 1, description: "Radiofrequência para remodelamento" },
  { name: "Ultrassom Terapêutico",         category: "fisioterapia", durationMinutes: 30, price: "80.00",  cost: "15.00", maxCapacity: 2, description: "Ultrassom para inflamações" },
  { name: "Eletroestimulação (TENS/FES)",  category: "fisioterapia", durationMinutes: 30, price: "70.00",  cost: "12.00", maxCapacity: 3, description: "Eletroestimulação neuromuscular" },
  { name: "Acupuntura",                    category: "fisioterapia", durationMinutes: 50, price: "150.00", cost: "20.00", maxCapacity: 1, description: "Acupuntura fisioterapêutica" },
  { name: "Kinesio Taping",               category: "fisioterapia", durationMinutes: 30, price: "60.00",  cost: "10.00", maxCapacity: 2, description: "Bandagem funcional elástica" },
];

const PATIENTS = [
  { name: "Ana Rodrigues",    cpf: "111.222.333-44", phone: "(11) 99999-0001", email: "ana.rodrigues@email.com",    birthDate: "1985-03-15", profession: "Professora",              address: "Rua das Flores, 123 – São Paulo/SP",       emergencyContact: "José Rodrigues (11) 98888-0001",   notes: "Lombalgia crônica" },
  { name: "Bruno Martins",    cpf: "222.333.444-55", phone: "(11) 99999-0002", email: "bruno.martins@email.com",    birthDate: "1990-07-22", profession: "Engenheiro",              address: "Av. Paulista, 456 – São Paulo/SP",          emergencyContact: "Carla Martins (11) 98888-0002",    notes: "Pós-cirúrgico de joelho" },
  { name: "Carla Ferreira",   cpf: "333.444.555-66", phone: "(11) 99999-0003", email: "carla.ferreira@email.com",   birthDate: "1978-11-08", profession: "Médica",                  address: "Rua Augusta, 789 – São Paulo/SP",           emergencyContact: "Paulo Ferreira (11) 98888-0003",   notes: "Cervicalgia e tensão muscular" },
  { name: "Diego Santos",     cpf: "444.555.666-77", phone: "(11) 99999-0004", email: "diego.santos@email.com",     birthDate: "1995-01-30", profession: "Designer",                address: "Rua Oscar Freire, 321 – São Paulo/SP",      emergencyContact: "Lúcia Santos (11) 98888-0004",     notes: "Tendinite no ombro direito" },
  { name: "Elena Sousa",      cpf: "555.666.777-88", phone: "(11) 99999-0005", email: "elena.sousa@email.com",      birthDate: "1982-09-14", profession: "Advogada",                address: "Rua da Consolação, 654 – São Paulo/SP",     emergencyContact: "Marcos Sousa (11) 98888-0005",     notes: "Hérnia discal L4-L5" },
  { name: "Fernanda Lima",    cpf: "666.777.888-99", phone: "(11) 99999-0006", email: "fernanda.lima@email.com",    birthDate: "1975-06-20", profession: "Empresária",              address: "Jardins, São Paulo/SP",                     emergencyContact: "Roberto Lima (11) 98888-0006",     notes: "Artrose no quadril" },
  { name: "Gabriel Costa",    cpf: "777.888.999-00", phone: "(11) 99999-0007", email: "gabriel.costa@email.com",    birthDate: "1992-12-05", profession: "Atleta",                  address: "Morumbi, São Paulo/SP",                     emergencyContact: "Silvia Costa (11) 98888-0007",     notes: "Entorse de tornozelo" },
  { name: "Helena Nunes",     cpf: "888.999.000-11", phone: "(11) 99999-0008", email: "helena.nunes@email.com",     birthDate: "1988-04-18", profession: "Contadora",               address: "Itaim Bibi, São Paulo/SP",                  emergencyContact: "André Nunes (11) 98888-0008",      notes: "Síndrome do impacto no ombro" },
  { name: "Igor Mendes",      cpf: "999.000.111-22", phone: "(11) 99999-0009", email: "igor.mendes@email.com",      birthDate: "1980-08-25", profession: "Bancário",                address: "Brooklin, São Paulo/SP",                    emergencyContact: "Patrícia Mendes (11) 98888-0009",  notes: "Dor lombar por postura" },
  { name: "Juliana Pereira",  cpf: "000.111.222-33", phone: "(11) 99999-0010", email: "juliana.pereira@email.com",  birthDate: "1993-02-12", profession: "Nutricionista",           address: "Vila Madalena, São Paulo/SP",               emergencyContact: "Carlos Pereira (11) 98888-0010",   notes: "Disfunção temporomandibular" },
  { name: "Lucas Araújo",     cpf: "111.000.222-33", phone: "(11) 99999-0011", email: "lucas.araujo@email.com",     birthDate: "1987-05-30", profession: "Prof. Educação Física",   address: "Lapa, São Paulo/SP",                        emergencyContact: "Tereza Araújo (11) 98888-0011",    notes: "Espondiloartrose" },
  { name: "Mariana Barbosa",  cpf: "222.111.333-44", phone: "(11) 99999-0012", email: "mariana.barbosa@email.com",  birthDate: "1991-10-03", profession: "Arquiteta",               address: "Pinheiros, São Paulo/SP",                   emergencyContact: "Felipe Barbosa (11) 98888-0012",   notes: "Epicondilite lateral" },
  { name: "Nelson Carvalho",  cpf: "333.222.444-55", phone: "(11) 99999-0013", email: "nelson.carvalho@email.com",  birthDate: "1970-07-14", profession: "Médico Ortopedista",      address: "Alto de Pinheiros, São Paulo/SP",           emergencyContact: "Beatriz Carvalho (11) 98888-0013", notes: "Gonartrose bilateral" },
  { name: "Olivia Teixeira",  cpf: "444.333.555-66", phone: "(11) 99999-0014", email: "olivia.teixeira@email.com",  birthDate: "1984-01-22", profession: "Dentista",                address: "Perdizes, São Paulo/SP",                    emergencyContact: "João Teixeira (11) 98888-0014",    notes: "Dor cervical por postura" },
  { name: "Pedro Cunha",      cpf: "555.444.666-77", phone: "(11) 99999-0015", email: "pedro.cunha@email.com",      birthDate: "1997-11-15", profession: "Estudante",               address: "Bela Vista, São Paulo/SP",                  emergencyContact: "Sandra Cunha (11) 98888-0015",     notes: "Pós-operatório de LCA" },
  { name: "Raquel Monteiro",  cpf: "666.555.777-88", phone: "(11) 99999-0016", email: "raquel.monteiro@email.com",  birthDate: "1979-04-08", profession: "Fisioterapeuta",          address: "Tatuapé, São Paulo/SP",                     emergencyContact: "Eduardo Monteiro (11) 98888-0016", notes: "Túnel do carpo bilateral" },
  { name: "Samuel Dias",      cpf: "777.666.888-99", phone: "(11) 99999-0017", email: "samuel.dias@email.com",      birthDate: "1983-09-20", profession: "Gerente de TI",           address: "Jabaquara, São Paulo/SP",                   emergencyContact: "Vanessa Dias (11) 98888-0017",     notes: "Dorsalgia por trabalho remoto" },
  { name: "Tatiana Fonseca",  cpf: "888.777.999-00", phone: "(11) 99999-0018", email: "tatiana.fonseca@email.com",  birthDate: "1976-12-01", profession: "Cozinheira",              address: "Santo André/SP",                            emergencyContact: "Marcos Fonseca (11) 98888-0018",   notes: "Bursite no ombro esquerdo" },
  { name: "Ulisses Gomes",    cpf: "999.888.000-11", phone: "(11) 99999-0019", email: "ulisses.gomes@email.com",    birthDate: "1989-06-18", profession: "Policial Militar",        address: "São Bernardo do Campo/SP",                  emergencyContact: "Regina Gomes (11) 98888-0019",     notes: "Lombalgia aguda por esforço" },
  { name: "Vitória Campos",   cpf: "000.999.111-22", phone: "(11) 99999-0020", email: "vitoria.campos@email.com",   birthDate: "1994-03-27", profession: "Bailarina",               address: "Moema, São Paulo/SP",                       emergencyContact: "Cláudia Campos (11) 98888-0020",   notes: "Fascite plantar bilateral" },
];

const MAIN_COMPLAINTS = [
  "Dor lombar intensa ao longo do dia", "Limitação e dor no joelho pós-cirúrgico",
  "Dor cervical e cefaleia tensional", "Dor e fraqueza no ombro direito",
  "Dor irradiada para a perna esquerda", "Dificuldade de locomoção e dor no quadril",
  "Dor e instabilidade no tornozelo", "Dor e limitação ao elevar o braço",
  "Dor lombar ao permanecer sentado", "Dor na ATM e dificuldade de mastigar",
  "Rigidez matinal e dor nas costas", "Queimação e dor no cotovelo direito",
  "Dificuldade de subir escadas e dor nos joelhos", "Dor no pescoço ao olhar para os lados",
  "Dor e limitação pós-cirurgia de LCA", "Formigamento e dormência nas mãos",
  "Dor entre as escápulas e fadiga", "Dor e limitação no ombro esquerdo",
  "Dor lombar aguda após esforço", "Dor na planta do pé ao caminhar",
];

const EVOLUTION_TEXTS = [
  "Paciente relata melhora significativa da dor. Mobilização articular, alongamento e fortalecimento realizados. Boa evolução clínica.",
  "Sessão com foco em ganho de amplitude de movimento. Paciente demonstrou boa adesão ao protocolo terapêutico.",
  "Exercícios de fortalecimento e estabilização realizados. Paciente evolui dentro do esperado para a fase.",
  "Boa resposta ao tratamento. Terapia manual e exercícios específicos aplicados. EVA reduziu 2 pontos.",
  "Ênfase em propriocepção e equilíbrio. Paciente relata maior autonomia nas atividades de vida diária.",
  "Ultrassom terapêutico e exercícios de cadeia cinética realizados. Evolução satisfatória.",
  "Mobilização articular e fortalecimento realizados. Paciente refere melhora funcional progressiva.",
  "Técnicas de relaxamento muscular e reeducação postural. Paciente comprometido com o tratamento.",
];

const PAYMENT_METHODS = ["dinheiro", "pix", "cartao_debito", "cartao_credito", "transferencia"];
const SLOTS = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","13:00","13:30","14:00","14:30","15:00","15:30","16:00","17:00"];

async function seed() {
  console.log("🌱 Iniciando seed completo jan–mar 2026...\n");

  // ── Clínica ───────────────────────────────────────────────────────────────
  console.log("🏢 Criando clínica...");
  const [clinic] = await db.insert(clinicsTable).values({ name: "FisioGest Demo" }).returning();
  const clinicId = clinic.id;
  console.log(`  ✅ Clínica "${clinic.name}" (id=${clinicId})`);

  // ── Usuários ─────────────────────────────────────────────────────────────
  console.log("\n👥 Criando usuários...");
  const userMap: Record<string, number> = {};
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const [user] = await db.insert(usersTable).values({ name: u.name, cpf: u.cpf, email: u.email, passwordHash, clinicId }).returning();
    userMap[u.email] = user.id;
    await db.insert(userRolesTable).values(u.roles.map((role) => ({ userId: user.id, clinicId, role })));
    console.log(`  ✅ ${u.name} [${u.roles.join(", ")}]`);
  }
  const profIds = [userMap["fisio@fisiogest.com.br"], userMap["rodrigo@fisiogest.com.br"], userMap["marta@fisiogest.com.br"]];

  // ── Procedimentos ─────────────────────────────────────────────────────────
  console.log("\n🏥 Criando procedimentos...");
  const insertedProcs = await db.insert(proceduresTable).values(PROCS.map((p) => ({ ...p, clinicId }))).returning();
  const procIds = insertedProcs.map((p) => p.id);
  console.log(`  ✅ ${procIds.length} procedimentos`);

  // ── Pacientes ─────────────────────────────────────────────────────────────
  console.log("\n🧑‍⚕️ Criando pacientes...");
  const insertedPats = await db.insert(patientsTable).values(PATIENTS.map((p) => ({ ...p, clinicId }))).returning();
  const patIds = insertedPats.map((p) => p.id);
  console.log(`  ✅ ${patIds.length} pacientes`);

  // ── Anamneses ─────────────────────────────────────────────────────────────
  console.log("\n📋 Criando anamneses, avaliações e planos...");
  const MEDHISTORY = ["Hipertensão controlada", "Diabetes tipo 2", "Sem comorbidades"];
  const MEDS = ["Anti-inflamatório conforme necessidade", "Losartana 50mg", "Metformina 850mg", "Nenhuma"];
  const ALLERGIES = ["Dipirona", "NKDA", "NKDA", "Penicilina", "NKDA"];
  const POSTURES = ["Hiperlordose lombar e protração de ombros", "Escoliose funcional leve à direita", "Anteriorização da cabeça e retificação cervical"];

  await db.insert(anamnesisTable).values(patIds.map((pid, i) => ({
    patientId: pid,
    mainComplaint: MAIN_COMPLAINTS[i],
    diseaseHistory: "Início insidioso há ~3 meses. Piora com movimentos e ao final do dia.",
    medicalHistory: MEDHISTORY[i % 3],
    medications: MEDS[i % 4],
    allergies: ALLERGIES[i % 5],
    familyHistory: "Histórico familiar de problemas articulares e reumatológicos.",
    lifestyle: i % 2 === 0 ? "Sedentário, trabalha sentado 8h/dia" : "Ativo, pratica atividade física 2x/semana",
    painScale: 5 + (i % 5),
  })));

  await db.insert(evaluationsTable).values(patIds.map((pid, i) => ({
    patientId: pid,
    inspection: "Paciente em bom estado geral, sem alterações evidentes na inspeção estática.",
    posture: POSTURES[i % 3],
    rangeOfMotion: "Limitação moderada nas amplitudes articulares. Flexão reduzida ~30%.",
    muscleStrength: "Força muscular diminuída nos estabilizadores do core (grau 3/5 no MMT).",
    orthopedicTests: i % 2 === 0 ? "Lasègue positivo à direita" : "Teste de Neer positivo",
    functionalDiagnosis: `Disfunção funcional: ${MAIN_COMPLAINTS[i]} com impacto nas AVDs.`,
  })));

  await db.insert(treatmentPlansTable).values(patIds.map((pid, i) => ({
    patientId: pid,
    objectives: "Reduzir dor, recuperar amplitude de movimento e reabilitar função muscular.",
    techniques: "Terapia manual, cinesioterapia, eletroterapia e exercícios terapêuticos.",
    frequency: "2× por semana",
    estimatedSessions: 20,
    status: i >= 17 ? "concluido" : "ativo",
  })));
  console.log(`  ✅ ${patIds.length} registros em cada tabela`);

  // ── Agendamentos: jan–mar 2026 ────────────────────────────────────────────
  console.log("\n📅 Criando agendamentos jan–mar 2026...");
  const pastDays   = workingDays("2026-01-05", "2026-03-21"); // 54 dias úteis
  const futureDays = workingDays("2026-03-23", "2026-04-04"); // próximas 2 semanas

  const apptValues: object[] = [];
  const apptMeta: { patIdx: number; procIdx: number; date: string; status: string }[] = [];

  for (const dayStr of pastDays) {
    const numSlots = rnd(5, 8);
    const usedSlots = new Set<string>();
    const usedPats  = new Set<number>();
    for (let s = 0; s < numSlots; s++) {
      let slot: string; do { slot = pick(SLOTS); } while (usedSlots.has(slot));
      let pIdx: number; do { pIdx = rnd(0, patIds.length - 1); } while (usedPats.has(pIdx));
      usedSlots.add(slot); usedPats.add(pIdx);
      const prIdx = rnd(0, procIds.length - 1);
      const dur   = PROCS[prIdx].durationMinutes;
      const r     = Math.random();
      const status = r < 0.78 ? "concluido" : r < 0.90 ? "faltou" : "cancelado";
      apptValues.push({ patientId: patIds[pIdx], procedureId: procIds[prIdx], professionalId: pick(profIds), date: dayStr, startTime: slot, endTime: addMinutes(slot, dur), status, clinicId });
      apptMeta.push({ patIdx: pIdx, procIdx: prIdx, date: dayStr, status });
    }
  }

  for (const dayStr of futureDays) {
    const numSlots = rnd(4, 7);
    const usedSlots = new Set<string>();
    const usedPats  = new Set<number>();
    for (let s = 0; s < numSlots; s++) {
      let slot: string; do { slot = pick(SLOTS); } while (usedSlots.has(slot));
      let pIdx: number; do { pIdx = rnd(0, patIds.length - 1); } while (usedPats.has(pIdx));
      usedSlots.add(slot); usedPats.add(pIdx);
      const prIdx = rnd(0, procIds.length - 1);
      const dur   = PROCS[prIdx].durationMinutes;
      const status = Math.random() < 0.7 ? "agendado" : "confirmado";
      apptValues.push({ patientId: patIds[pIdx], procedureId: procIds[prIdx], professionalId: pick(profIds), date: dayStr, startTime: slot, endTime: addMinutes(slot, dur), status, clinicId });
      apptMeta.push({ patIdx: pIdx, procIdx: prIdx, date: dayStr, status });
    }
  }

  // Batch insert appointments in chunks of 100
  const insertedAppts: { id: number; patientId: number; procedureId: number; status: string; date: string }[] = [];
  for (let i = 0; i < apptValues.length; i += 100) {
    const chunk = await db.insert(appointmentsTable).values(apptValues.slice(i, i + 100) as any[]).returning();
    insertedAppts.push(...chunk);
  }
  const concluded = insertedAppts.filter((a) => a.status === "concluido");
  console.log(`  ✅ ${insertedAppts.length} agendamentos (${concluded.length} concluídos, ${insertedAppts.filter(a => a.status === "agendado" || a.status === "confirmado").length} futuros)`);

  // ── Evoluções (batch) ─────────────────────────────────────────────────────
  console.log("\n📝 Criando evoluções...");
  const evoValues = concluded.map((a) => ({
    patientId: a.patientId,
    appointmentId: a.id,
    description: pick(EVOLUTION_TEXTS),
    patientResponse: "Paciente relatou melhora em relação à sessão anterior.",
    clinicalNotes: "Evolução dentro do esperado. Manter protocolo atual.",
    complications: null,
  }));
  for (let i = 0; i < evoValues.length; i += 200) {
    await db.insert(evolutionsTable).values(evoValues.slice(i, i + 200));
  }
  console.log(`  ✅ ${evoValues.length} evoluções`);

  // ── Receitas financeiras (batch) ──────────────────────────────────────────
  console.log("\n💰 Criando registros financeiros...");
  const recValues = concluded.map((a) => {
    const prIdx = procIds.indexOf(a.procedureId);
    const proc  = PROCS[prIdx] ?? PROCS[0];
    const patIdx = patIds.indexOf(a.patientId);
    const pat   = PATIENTS[patIdx] ?? PATIENTS[0];
    return {
      type: "receita" as const,
      amount: proc.price,
      description: `${proc.name} – ${pat.name}`,
      category: proc.category,
      appointmentId: a.id,
      patientId: a.patientId,
      procedureId: a.procedureId,
      paymentDate: a.date,
      paymentMethod: pick(PAYMENT_METHODS),
      clinicId,
    };
  });
  for (let i = 0; i < recValues.length; i += 200) {
    await db.insert(financialRecordsTable).values(recValues.slice(i, i + 200));
  }
  console.log(`  ✅ ${recValues.length} receitas`);

  // ── Despesas mensais ──────────────────────────────────────────────────────
  const EXPENSES = [
    { desc: "Aluguel do consultório",          amount: "3500.00", cat: "fixo",        method: "transferencia" },
    { desc: "Condomínio",                      amount: "420.00",  cat: "fixo",        method: "boleto" },
    { desc: "Conta de luz",                    amount: "380.00",  cat: "fixo",        method: "debito_automatico" },
    { desc: "Internet e telefone",             amount: "220.00",  cat: "fixo",        method: "debito_automatico" },
    { desc: "Plano de saúde da equipe",        amount: "1200.00", cat: "pessoal",     method: "debito_automatico" },
    { desc: "FisioGest Pro (assinatura)",      amount: "199.00",  cat: "tecnologia",  method: "cartao_credito" },
    { desc: "Marketing digital",               amount: "500.00",  cat: "marketing",   method: "cartao_credito" },
    { desc: "Contador",                        amount: "350.00",  cat: "pessoal",     method: "transferencia" },
    { desc: "Materiais de fisioterapia",       amount: "450.00",  cat: "materiais",   method: "cartao_credito" },
    { desc: "Produtos para estética",          amount: "620.00",  cat: "materiais",   method: "cartao_credito" },
    { desc: "Manutenção de equipamentos",      amount: "280.00",  cat: "manutencao",  method: "transferencia" },
  ];
  const months = [{ label: "Janeiro/2026", day: "2026-01-05" }, { label: "Fevereiro/2026", day: "2026-02-03" }, { label: "Março/2026", day: "2026-03-03" }];
  const expValues = months.flatMap((month) =>
    EXPENSES.map((e) => ({ type: "despesa" as const, amount: e.amount, description: `${e.desc} – ${month.label}`, category: e.cat, paymentDate: month.day, paymentMethod: e.method, clinicId }))
  );
  await db.insert(financialRecordsTable).values(expValues);
  console.log(`  ✅ ${expValues.length} despesas`);

  // ── Altas ──────────────────────────────────────────────────────────────────
  console.log("\n🎓 Criando altas médicas...");
  await db.insert(dischargeSummariesTable).values(
    patIds.slice(17).map((pid) => ({
      patientId: pid,
      dischargeDate: "2026-03-10",
      dischargeReason: "Alta por objetivos terapêuticos atingidos",
      achievedResults: "Paciente atingiu 90% dos objetivos. Dor controlada e função restaurada.",
      recommendations: "Manter atividade física regular. Retornar em caso de recorrência.",
    }))
  );
  console.log(`  ✅ ${patIds.slice(17).length} altas criadas`);

  // ── Resumo ─────────────────────────────────────────────────────────────────
  const totalRec = recValues.length;
  const totalExp = expValues.length;
  const totalEvo = evoValues.length;
  const sumRec   = recValues.reduce((s, r) => s + parseFloat(r.amount), 0);
  const sumExp   = expValues.reduce((s, e) => s + parseFloat(e.amount), 0);

  console.log("\n" + "═".repeat(60));
  console.log("✅  SEED CONCLUÍDO!");
  console.log("═".repeat(60));
  console.log(`   👥  Usuários:        ${USERS.length}`);
  console.log(`   🏥  Procedimentos:   ${PROCS.length}`);
  console.log(`   🧑  Pacientes:       ${PATIENTS.length}`);
  console.log(`   📅  Agendamentos:    ${insertedAppts.length}  (jan–abr/2026)`);
  console.log(`   📝  Evoluções:       ${totalEvo}`);
  console.log(`   💰  Receitas:        ${totalRec}  →  R$ ${sumRec.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`   💸  Despesas:        ${totalExp}  →  R$ ${sumExp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`   🎓  Altas:           ${patIds.slice(17).length}`);
  console.log("═".repeat(60));
  console.log("\n🔑 Credenciais (senha: 123456 para todos):");
  for (const u of USERS) {
    console.log(`   ${u.email.padEnd(38)} [${u.roles.join(", ")}]`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => { console.error("❌ Erro:", err?.cause ?? err); process.exit(1); });
