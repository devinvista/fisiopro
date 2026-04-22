import { format, differenceInYears, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ClinicInfo } from "../../types";
import { todayBRTDate, formatDateTime } from "../format";
import { buildClinicHeaderHTML, escapeHtml } from "./_shared";

export interface ProntuarioData {
  patient: {
    name: string; cpf?: string | null; birthDate?: string | null;
    phone?: string | null; email?: string | null; address?: string | null;
    profession?: string | null; emergencyContact?: string | null; notes?: string | null;
  };
  anamnesis?: {
    templateType?: string | null;
    mainComplaint?: string | null; diseaseHistory?: string | null; medicalHistory?: string | null;
    medications?: string | null; allergies?: string | null; familyHistory?: string | null;
    lifestyle?: string | null; painScale?: number | null; updatedAt?: string;
    occupation?: string | null; laterality?: string | null; cid10?: string | null;
    painLocation?: string | null; painAggravatingFactors?: string | null; painRelievingFactors?: string | null;
    functionalImpact?: string | null; patientGoals?: string | null; previousTreatments?: string | null;
    tobaccoAlcohol?: string | null;
    phototype?: string | null; skinType?: string | null; skinConditions?: string | null;
    sunExposure?: string | null; sunProtector?: string | null; currentSkincareRoutine?: string | null;
    previousAestheticTreatments?: string | null; aestheticReactions?: string | null;
    facialSurgeries?: string | null; sensitizingMedications?: string | null;
    skinContraindications?: string | null; aestheticGoalDetails?: string | null;
    mainBodyConcern?: string | null; bodyConcernRegions?: string | null;
    celluliteGrade?: string | null; bodyWeight?: string | null; bodyHeight?: string | null;
    bodyMeasurements?: string | null; physicalActivityLevel?: string | null;
    physicalActivityType?: string | null; waterIntake?: string | null; dietHabits?: string | null;
    bodyMedicalConditions?: string | null; bodyContraindications?: string | null;
    previousBodyTreatments?: string | null;
  } | null;
  evaluations?: Array<{
    inspection?: string; posture?: string; rangeOfMotion?: string;
    muscleStrength?: string; orthopedicTests?: string; functionalDiagnosis?: string;
    createdAt?: string;
  }>;
  treatmentPlan?: {
    objectives?: string; techniques?: string; frequency?: string;
    estimatedSessions?: string | number; status?: string; updatedAt?: string;
  } | null;
  evolutions?: Array<{
    description?: string; patientResponse?: string; clinicalNotes?: string;
    complications?: string; painScale?: number | null; appointmentId?: number | null; createdAt?: string;
  }>;
  appointments?: Array<{
    id: number; date: string; startTime?: string; status?: string;
    procedure?: { name?: string };
  }>;
  discharge?: {
    dischargeDate?: string; dischargeReason?: string;
    achievedResults?: string; recommendations?: string;
  } | null;
  professional?: { name?: string };
  clinic?: ClinicInfo | null;
}

export function generateFullProntuarioHTML(d: ProntuarioData): { html: string; css: string } {
  const p = d.patient;
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const age = p.birthDate ? differenceInYears(todayBRTDate(), parseISO(p.birthDate)) : null;
  const cpfFmt = p.cpf ? p.cpf.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";
  const evolutions = d.evolutions ?? [];
  const evaluations = d.evaluations ?? [];
  const appointments = d.appointments ?? [];
  const sortedAppts = [...appointments].sort((a, b) =>
    new Date(a.date + "T" + (a.startTime || "00:00")).getTime() -
    new Date(b.date + "T" + (b.startTime || "00:00")).getTime(),
  );
  const completedAppts = appointments.filter(a => a.status === "concluido" || a.status === "presenca");

  const section = (title: string, icon: string, content: string) => `
    <div class="psection">
      <div class="psection-head"><span class="psection-icon">${icon}</span>${title}</div>
      <div class="psection-body">${content}</div>
    </div>`;

  const textBlock = (label: string, value?: string | null) =>
    value ? `<div class="ptextblock"><div class="ptlabel">${label}</div><div class="ptcontent">${value}</div></div>` : "";

  // ── Patient header ─────────────────────────────────────────────────────────
  const clinicHeaderHtml = d.clinic ? buildClinicHeaderHTML(d.clinic) : "";
  const clinicNameFull = d.clinic?.name || "FisioGest Pro";
  const headerHtml = `
    ${clinicHeaderHtml}
    <div class="pdoc-header">
      <div class="pdoc-title">PRONTUÁRIO ELETRÔNICO DO PACIENTE</div>
      <div class="pdoc-subtitle">Documento Clínico Completo — ${clinicNameFull}</div>
      <div class="pdoc-subtitle">Emitido em ${today}${d.professional?.name ? " por " + d.professional.name : ""}</div>
    </div>
    <div class="ppatient-box">
      <div class="ppatient-name">${p.name}${age ? " — " + age + " anos" : ""}</div>
      <div class="ppatient-row">
        <div class="ppatient-field"><span class="plabel">CPF</span><span class="pvalue">${cpfFmt}</span></div>
        ${p.birthDate ? `<div class="ppatient-field"><span class="plabel">Nascimento</span><span class="pvalue">${format(parseISO(p.birthDate), "dd/MM/yyyy")}</span></div>` : ""}
        ${p.phone ? `<div class="ppatient-field"><span class="plabel">Telefone</span><span class="pvalue">${p.phone}</span></div>` : ""}
        ${p.email ? `<div class="ppatient-field"><span class="plabel">E-mail</span><span class="pvalue">${p.email}</span></div>` : ""}
      </div>
      <div class="ppatient-row">
        ${p.address ? `<div class="ppatient-field"><span class="plabel">Endereço</span><span class="pvalue">${p.address}</span></div>` : ""}
        ${p.profession ? `<div class="ppatient-field"><span class="plabel">Profissão</span><span class="pvalue">${p.profession}</span></div>` : ""}
        ${p.emergencyContact ? `<div class="ppatient-field pfield-emergency"><span class="plabel">Contato de Emergência</span><span class="pvalue">${p.emergencyContact}</span></div>` : ""}
      </div>
      ${p.notes ? `<div class="pnotes">⚠️ <strong>Obs:</strong> ${p.notes}</div>` : ""}
    </div>`;

  // ── Table of contents ──────────────────────────────────────────────────────
  const tocItems: string[] = [];
  if (d.anamnesis) tocItems.push("1. Anamnese");
  if (evaluations.length) tocItems.push("2. Avaliações Físicas (" + evaluations.length + ")");
  if (d.treatmentPlan) tocItems.push("3. Plano de Tratamento");
  if (evolutions.length) tocItems.push("4. Evoluções de Sessão (" + evolutions.length + ")");
  if (d.discharge) tocItems.push("5. Alta Fisioterapêutica");
  const tocHtml = tocItems.length ? `<div class="ptoc"><div class="ptoc-title">Índice</div><ul class="ptoc-list">${tocItems.map(i => `<li>${i}</li>`).join("")}</ul></div>` : "";

  // ── 1. Anamnesis ──────────────────────────────────────────────────────────
  let anamnesisHtml = "";
  if (d.anamnesis) {
    const a = d.anamnesis;
    const tmpl = a.templateType || "reabilitacao";
    const painColor = (a.painScale ?? 0) >= 7 ? "#dc2626" : (a.painScale ?? 0) >= 4 ? "#f97316" : "#16a34a";
    const tmplLabels: Record<string, string> = {
      reabilitacao: "Reabilitação / Fisioterapia",
      esteticaFacial: "Estética Facial",
      esteticaCorporal: "Estética Corporal",
    };
    const templateBadge = `<div style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px;margin-bottom:10px;letter-spacing:.5px;text-transform:uppercase">${tmplLabels[tmpl] || tmpl}</div>`;

    let anamBody = "";

    if (tmpl === "reabilitacao") {
      anamBody = `
        ${templateBadge}
        <div class="ptwo-col">
          ${textBlock("Profissão / Ocupação", a.occupation)}
          ${textBlock("Lateralidade", a.laterality)}
          ${textBlock("CID-10", a.cid10)}
        </div>
        ${textBlock("Queixa Principal (QP)", a.mainComplaint)}
        ${textBlock("História da Doença Atual (HDA)", a.diseaseHistory)}
        ${a.painScale != null ? `<div class="ppain-row">
          <div class="plabel">Escala de Dor (EVA)</div>
          <div class="ppain-bar-wrap">
            <div class="ppain-bar"><div class="ppain-fill" style="width:${(a.painScale / 10) * 100}%;background:${painColor}"></div></div>
            <span class="ppain-val" style="color:${painColor}">${a.painScale}/10 — ${a.painScale === 0 ? "Sem dor" : a.painScale <= 3 ? "Leve" : a.painScale <= 6 ? "Moderada" : a.painScale <= 9 ? "Intensa" : "Insuportável"}</span>
          </div>
        </div>` : ""}
        <div class="ptwo-col">
          ${textBlock("Localização e Irradiação da Dor", a.painLocation)}
          ${textBlock("Fatores que Agravam", a.painAggravatingFactors)}
          ${textBlock("Fatores que Aliviam", a.painRelievingFactors)}
          ${textBlock("Impacto Funcional (AVDs)", a.functionalImpact)}
        </div>
        ${textBlock("Histórico Médico (HMP)", a.medicalHistory)}
        ${textBlock("Tratamentos Anteriores", a.previousTreatments)}
        <div class="ptwo-col">
          ${textBlock("Medicamentos em Uso", a.medications)}
          ${textBlock("Alergias", a.allergies)}
          ${textBlock("Histórico Familiar", a.familyHistory)}
          ${textBlock("Tabagismo / Etilismo", a.tobaccoAlcohol)}
        </div>
        ${textBlock("Estilo de Vida", a.lifestyle)}
        ${textBlock("Objetivos e Expectativas", a.patientGoals)}
      `;
    } else if (tmpl === "esteticaFacial") {
      const skinTypeLabels: Record<string, string> = { normal: "Normal", seca: "Seca", oleosa: "Oleosa", mista: "Mista", sensivel: "Sensível", acneica: "Acneica", desidratada: "Desidratada" };
      const sunExpLabels: Record<string, string> = { alta: "Alta (trabalha ao ar livre)", moderada: "Moderada", baixa: "Baixa (ambiente fechado)" };
      const sunProtLabels: Record<string, string> = { "diario": "Diário (FPS 30+)", "as-vezes": "Às vezes", "nao-usa": "Não usa" };
      anamBody = `
        ${templateBadge}
        <div class="ptwo-col">
          ${textBlock("Profissão / Ocupação", a.occupation)}
          ${textBlock("CID-10", a.cid10)}
        </div>
        ${textBlock("Queixa Principal", a.mainComplaint)}
        ${textBlock("Histórico do Problema", a.diseaseHistory)}
        <div style="margin:12px 0;padding:10px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9a3412;margin-bottom:8px">Análise de Pele</div>
          <div class="ptwo-col">
            ${textBlock("Tipo de Pele", a.skinType ? skinTypeLabels[a.skinType] || a.skinType : null)}
            ${textBlock("Fototipo (Fitzpatrick)", a.phototype ? `Tipo ${a.phototype}` : null)}
            ${textBlock("Exposição Solar", a.sunExposure ? sunExpLabels[a.sunExposure] || a.sunExposure : null)}
            ${textBlock("Uso de Protetor Solar", a.sunProtector ? sunProtLabels[a.sunProtector] || a.sunProtector : null)}
          </div>
          ${a.skinConditions ? `<div class="ptextblock"><div class="ptlabel">Condições de Pele</div><div class="ptcontent">${a.skinConditions}</div></div>` : ""}
          ${textBlock("Rotina de Skincare Atual", a.currentSkincareRoutine)}
        </div>
        ${textBlock("Tratamentos Estéticos Anteriores", a.previousAestheticTreatments)}
        <div class="ptwo-col">
          ${textBlock("Reações / Complicações", a.aestheticReactions)}
          ${textBlock("Cirurgias Faciais", a.facialSurgeries)}
          ${textBlock("Medicamentos Fotossensibilizantes", a.sensitizingMedications)}
          ${textBlock("Alergias", a.allergies)}
        </div>
        ${a.skinContraindications ? `<div style="margin:8px 0;padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#991b1b;margin-bottom:6px">⚠️ Contraindicações Marcadas</div><div style="font-size:12px;color:#7f1d1d">${a.skinContraindications}</div></div>` : ""}
        ${textBlock("Outras Condições Médicas", a.medicalHistory)}
        ${textBlock("O que deseja melhorar", a.aestheticGoalDetails)}
        ${textBlock("Expectativas e Disponibilidade", a.patientGoals)}
      `;
    } else if (tmpl === "esteticaCorporal") {
      const actLabels: Record<string, string> = { "sedentario": "Sedentário", "levemente-ativo": "Levemente ativo (1–2×/sem.)", "moderado": "Moderadamente ativo (3–4×/sem.)", "muito-ativo": "Muito ativo (5+×/sem.)" };
      const waterLabels: Record<string, string> = { "menos-1L": "Menos de 1 L/dia", "1-1.5L": "1 a 1,5 L/dia", "1.5-2L": "1,5 a 2 L/dia", "mais-2L": "Mais de 2 L/dia" };
      const cellLabels: Record<string, string> = { "0": "Grau 0 — Sem celulite", "I": "Grau I — Aparece ao apertar", "II": "Grau II — Visível em pé", "III": "Grau III — Depressões profundas", "IV": "Grau IV — Dolorosa à palpação" };
      let bmiBlock = "";
      if (a.bodyWeight && a.bodyHeight) {
        const h = parseFloat(a.bodyHeight) / 100;
        const w = parseFloat(a.bodyWeight);
        if (!isNaN(h) && !isNaN(w) && h > 0) {
          const bmi = (w / (h * h)).toFixed(1);
          const cat = parseFloat(bmi) < 18.5 ? "Abaixo do peso" : parseFloat(bmi) < 25 ? "Peso normal" : parseFloat(bmi) < 30 ? "Sobrepeso" : "Obesidade";
          bmiBlock = `<div class="ptextblock"><div class="ptlabel">IMC</div><div class="ptcontent"><strong>${bmi}</strong> — ${cat} (${a.bodyWeight} kg / ${a.bodyHeight} cm)</div></div>`;
        }
      }
      anamBody = `
        ${templateBadge}
        <div class="ptwo-col">
          ${textBlock("Profissão / Ocupação", a.occupation)}
        </div>
        ${textBlock("Queixa Principal", a.mainComplaint)}
        ${textBlock("Histórico do Problema", a.diseaseHistory)}
        <div style="margin:12px 0;padding:10px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#5b21b6;margin-bottom:8px">Dados Corporais</div>
          <div class="ptwo-col">
            ${textBlock("Peso", a.bodyWeight ? `${a.bodyWeight} kg` : null)}
            ${textBlock("Altura", a.bodyHeight ? `${a.bodyHeight} cm` : null)}
          </div>
          ${bmiBlock}
          ${textBlock("Medidas (Perimetria)", a.bodyMeasurements)}
          ${a.celluliteGrade ? textBlock("Grau de Celulite (Nürnberger-Müller)", cellLabels[a.celluliteGrade] || `Grau ${a.celluliteGrade}`) : ""}
          ${a.mainBodyConcern ? `<div class="ptextblock"><div class="ptlabel">Principais Queixas</div><div class="ptcontent">${a.mainBodyConcern}</div></div>` : ""}
          ${a.bodyConcernRegions ? `<div class="ptextblock"><div class="ptlabel">Regiões de Interesse</div><div class="ptcontent">${a.bodyConcernRegions}</div></div>` : ""}
        </div>
        <div style="margin:12px 0;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#14532d;margin-bottom:8px">Hábitos de Vida</div>
          <div class="ptwo-col">
            ${textBlock("Atividade Física", a.physicalActivityLevel ? actLabels[a.physicalActivityLevel] || a.physicalActivityLevel : null)}
            ${textBlock("Tipo de Atividade", a.physicalActivityType)}
            ${textBlock("Ingestão Hídrica", a.waterIntake ? waterLabels[a.waterIntake] || a.waterIntake : null)}
            ${textBlock("Tabagismo / Etilismo", a.tobaccoAlcohol)}
          </div>
          ${textBlock("Hábitos Alimentares", a.dietHabits)}
          ${textBlock("Sono e Estresse", a.lifestyle)}
        </div>
        ${a.bodyContraindications ? `<div style="margin:8px 0;padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#991b1b;margin-bottom:6px">⚠️ Contraindicações Marcadas</div><div style="font-size:12px;color:#7f1d1d">${a.bodyContraindications}</div></div>` : ""}
        <div class="ptwo-col">
          ${textBlock("Condições Hormonais", a.bodyMedicalConditions)}
          ${textBlock("Medicamentos em Uso", a.medications)}
          ${textBlock("Alergias", a.allergies)}
          ${textBlock("Tratamentos Corporais Anteriores", a.previousBodyTreatments)}
        </div>
        ${textBlock("Resultado Esperado", a.patientGoals)}
        ${textBlock("Disponibilidade / Prazo", a.aestheticGoalDetails)}
      `;
    }

    anamnesisHtml = section("1. Ficha de Anamnese", "📋", `
      ${d.anamnesis.updatedAt ? `<p class="psec-meta">Atualizada em ${formatDateTime(d.anamnesis.updatedAt)}</p>` : ""}
      ${anamBody}
    `);
  }

  // ── 2. Evaluations ─────────────────────────────────────────────────────────
  let evaluationsHtml = "";
  if (evaluations.length) {
    const cards = evaluations.map((ev, idx) => {
      const num = evaluations.length - idx;
      const dateStr = ev.createdAt ? formatDateTime(ev.createdAt) : "";
      return `<div class="pevo-card">
        <div class="pevo-head"><span class="pevo-num">${num}</span><strong>Avaliação #${num}</strong><span class="pevo-date">${dateStr}</span></div>
        <div class="ptwo-col">
          ${textBlock("Inspeção", ev.inspection)}
          ${textBlock("Postura", ev.posture)}
          ${textBlock("Amplitude de Movimento", ev.rangeOfMotion)}
          ${textBlock("Força Muscular", ev.muscleStrength)}
        </div>
        ${textBlock("Testes Ortopédicos", ev.orthopedicTests)}
        ${textBlock("Diagnóstico Funcional", ev.functionalDiagnosis)}
      </div>`;
    }).join("");
    evaluationsHtml = section("2. Avaliações Físicas", "🔍", cards);
  }

  // ── 3. Treatment Plan ─────────────────────────────────────────────────────
  let planHtml = "";
  if (d.treatmentPlan) {
    const pl = d.treatmentPlan;
    const statusLabel: Record<string, string> = { ativo: "Ativo", concluido: "Concluído", suspenso: "Suspenso" };
    const estimated = pl.estimatedSessions ? Number(pl.estimatedSessions) : 0;
    const pct = estimated > 0 ? Math.min(100, (completedAppts.length / estimated) * 100) : 0;
    const rows = completedAppts
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((a, i) => `<tr><td>${i + 1}</td><td>${format(parseISO(a.date), "dd/MM/yyyy")}</td><td>${a.startTime || "—"}</td><td>${a.procedure?.name || "—"}</td></tr>`)
      .join("");
    planHtml = section("3. Plano de Tratamento", "🎯", `
      ${pl.updatedAt ? `<p class="psec-meta">Atualizado em ${formatDateTime(pl.updatedAt)}</p>` : ""}
      <div class="pplan-status">Status: <strong>${statusLabel[pl.status || "ativo"] || "Ativo"}</strong>${pl.frequency ? " &bull; Frequência: <strong>" + pl.frequency + "</strong>" : ""}${estimated ? " &bull; Sessões estimadas: <strong>" + estimated + "</strong>" : ""}</div>
      ${estimated > 0 ? `<div class="pprogress-wrap">
        <div class="plabel">Progresso: ${completedAppts.length} de ${estimated} sessões (${pct.toFixed(1)}%)</div>
        <div class="ppain-bar" style="margin-top:4px"><div class="ppain-fill" style="width:${pct.toFixed(0)}%;background:#1d4ed8"></div></div>
      </div>` : ""}
      ${textBlock("Objetivos", pl.objectives)}
      ${textBlock("Técnicas e Recursos", pl.techniques)}
      ${rows ? `<div class="ptextblock"><div class="ptlabel">Histórico de Sessões Concluídas</div>
        <table class="psessions-table"><thead><tr><th>#</th><th>Data</th><th>Horário</th><th>Procedimento</th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : ""}
    `);
  }

  // ── 4. Evolutions ──────────────────────────────────────────────────────────
  let evolutionsHtml = "";
  if (evolutions.length) {
    const cards = evolutions.map((ev, idx) => {
      const linkedAppt = appointments.find(a => a.id === ev.appointmentId);
      let sessionNum = evolutions.length - idx;
      if (ev.appointmentId) {
        const pos = sortedAppts.findIndex(a => a.id === ev.appointmentId);
        if (pos !== -1) sessionNum = pos + 1;
      }
      const dateStr = ev.createdAt ? formatDateTime(ev.createdAt) : "";
      const apptInfo = linkedAppt ? `📅 Consulta vinculada: ${format(parseISO(linkedAppt.date), "dd/MM/yyyy")} — ${linkedAppt.startTime || ""}` : "";
      const evaPainColor = (ev.painScale ?? 0) >= 7 ? "#dc2626" : (ev.painScale ?? 0) >= 4 ? "#f97316" : "#16a34a";
      const evaHtml = ev.painScale != null ? `<div class="ppain-row">
        <div class="plabel">Escala de Dor (EVA)</div>
        <div class="ppain-bar-wrap">
          <div class="ppain-bar"><div class="ppain-fill" style="width:${(ev.painScale / 10) * 100}%;background:${evaPainColor}"></div></div>
          <span class="ppain-val" style="color:${evaPainColor}">${ev.painScale}/10</span>
        </div>
      </div>` : "";
      return `<div class="pevo-card">
        <div class="pevo-head"><span class="pevo-num">${sessionNum}</span><strong>Sessão ${sessionNum}</strong><span class="pevo-date">${dateStr}</span></div>
        ${apptInfo ? `<div class="pevo-appt">${apptInfo}</div>` : ""}
        ${textBlock("Descrição da Sessão", ev.description)}
        ${textBlock("Resposta do Paciente", ev.patientResponse)}
        ${evaHtml}
        ${textBlock("Notas Clínicas", ev.clinicalNotes)}
        ${ev.complications ? `<div class="ptextblock pcomplication">${textBlock("⚠️ Intercorrências", ev.complications)}</div>` : ""}
      </div>`;
    }).join("");
    evolutionsHtml = section("4. Evoluções de Sessão", "📈", cards);
  }

  // ── 5. Discharge ──────────────────────────────────────────────────────────
  let dischargeHtml = "";
  if (d.discharge) {
    const dc = d.discharge;
    const dischargeDate = dc.dischargeDate
      ? format(parseISO(dc.dischargeDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      : today;
    dischargeHtml = section("5. Alta Fisioterapêutica", "✅", `
      <div class="pplan-status">Data da Alta: <strong>${dischargeDate}</strong></div>
      ${textBlock("Motivo da Alta", dc.dischargeReason)}
      ${textBlock("Resultados Alcançados", dc.achievedResults)}
      ${textBlock("Recomendações ao Paciente", dc.recommendations)}
    `);
  }

  // ── Signature ──────────────────────────────────────────────────────────────
  const signatureHtml = `
    <div class="psignature">
      <div class="psig-line"></div>
      <div class="psig-name">${d.professional?.name || "Fisioterapeuta Responsável"}</div>
      <div class="psig-label">Profissional Responsável pelo Prontuário</div>
    </div>
    <div class="pfooter">
      Prontuário gerado em ${today} &bull; ${escapeHtml(d.clinic?.name || "FisioGest Pro")} &bull; Documento de uso clínico — COFFITO
    </div>`;

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#1e293b;background:#fff;padding:1.5cm 2cm}
    .pdoc-header{text-align:center;border-bottom:3px solid #1d4ed8;padding-bottom:14px;margin-bottom:20px}
    .pdoc-title{font-size:16pt;font-weight:800;color:#1d4ed8;letter-spacing:.5px;margin-bottom:4px}
    .pdoc-subtitle{font-size:9pt;color:#64748b;margin-top:2px}
    .ppatient-box{border:2px solid #1d4ed8;border-radius:8px;padding:14px 18px;margin-bottom:20px;background:#eff6ff}
    .ppatient-name{font-size:14pt;font-weight:800;color:#1e3a8a;margin-bottom:10px}
    .ppatient-row{display:flex;flex-wrap:wrap;gap:12px 24px;margin-bottom:6px}
    .ppatient-field{display:flex;flex-direction:column;min-width:150px}
    .pfield-emergency{background:#fef9c3;border:1px solid #fbbf24;border-radius:4px;padding:4px 8px}
    .plabel{font-size:8pt;font-weight:700;text-transform:uppercase;color:#64748b;margin-bottom:2px}
    .pvalue{font-size:10pt;color:#1e293b;font-weight:500}
    .pnotes{margin-top:8px;font-size:9pt;color:#92400e;background:#fffbeb;border-radius:4px;padding:6px 10px}
    .ptoc{margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;background:#f8fafc}
    .ptoc-title{font-weight:700;font-size:10pt;margin-bottom:6px;color:#1e293b}
    .ptoc-list{list-style:none;display:flex;flex-wrap:wrap;gap:4px 24px}
    .ptoc-list li{font-size:9.5pt;color:#475569}
    .psection{margin-bottom:24px;page-break-inside:avoid}
    .psection-head{font-size:12pt;font-weight:800;color:#1e3a8a;border-bottom:2px solid #1d4ed8;padding-bottom:6px;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .psection-icon{font-size:13pt}
    .psection-body{}
    .psec-meta{font-size:8.5pt;color:#94a3b8;margin-bottom:10px;font-style:italic}
    .ptextblock{margin-bottom:10px}
    .ptlabel{font-size:8.5pt;font-weight:700;text-transform:uppercase;color:#475569;margin-bottom:3px}
    .ptcontent{background:#f8fafc;border-left:3px solid #cbd5e1;padding:8px 12px;font-size:10pt;line-height:1.6;white-space:pre-wrap;border-radius:0 4px 4px 0;color:#1e293b}
    .ptwo-col{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
    .pplan-status{font-size:10pt;margin-bottom:10px;color:#1e293b;background:#f1f5f9;padding:8px 12px;border-radius:6px}
    .pprogress-wrap{margin-bottom:10px}
    .ppain-row{margin-top:10px}
    .ppain-bar-wrap{display:flex;align-items:center;gap:10px;margin-top:4px}
    .ppain-bar{background:#e2e8f0;height:10px;border-radius:5px;flex:1}
    .ppain-fill{height:10px;border-radius:5px}
    .ppain-val{font-weight:800;font-size:13pt;min-width:36px}
    .pevo-card{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid}
    .pevo-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;border-bottom:1px solid #f1f5f9;padding-bottom:8px}
    .pevo-num{display:inline-flex;align-items:center;justify-content:center;background:#1d4ed8;color:#fff;border-radius:50%;width:24px;height:24px;font-size:9pt;font-weight:800;flex-shrink:0}
    .pevo-date{font-size:9pt;color:#94a3b8;margin-left:auto}
    .pevo-appt{font-size:9pt;color:#1d4ed8;margin-bottom:8px;font-style:italic}
    .pcomplication .ptcontent{border-left-color:#ef4444;background:#fef2f2}
    .psessions-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:9.5pt}
    .psessions-table th{background:#1d4ed8;color:#fff;padding:5px 8px;text-align:left;font-weight:700}
    .psessions-table td{border:1px solid #e2e8f0;padding:5px 8px}
    .psessions-table tr:nth-child(even) td{background:#f8fafc}
    .psignature{margin-top:50px;text-align:center}
    .psig-line{border-top:1px solid #94a3b8;display:inline-block;width:250px;margin-bottom:6px}
    .psig-name{font-size:11pt;font-weight:700;color:#1e293b}
    .psig-label{font-size:9pt;color:#64748b}
    .pfooter{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:8pt;color:#94a3b8;text-align:center}
    @media print{@page{size:A4;margin:1.5cm 2cm}body{padding:0}.psection{page-break-inside:avoid}}
  `;

  return { html: `${headerHtml}${tocHtml}${anamnesisHtml}${evaluationsHtml}${planHtml}${evolutionsHtml}${dischargeHtml}${signatureHtml}`, css };
}
