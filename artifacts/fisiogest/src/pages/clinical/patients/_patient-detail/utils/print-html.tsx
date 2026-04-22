import { useState } from "react";
  import { format, differenceInYears, parseISO } from "date-fns";
  import { ptBR } from "date-fns/locale";
  import { Loader2, FileText } from "lucide-react";
  import { Button } from "@/components/ui/button";
  import { useAuth } from "@/utils/use-auth";
  import type { PatientBasic, ClinicInfo, PlanProcedureItem } from "../types";
  import { todayBRTDate, formatDateTime } from "./format";

  /**
   * Stack de impressão do prontuário do paciente.
   *
   * Exporta gerador HTML para alta, evoluções, plano de tratamento, contrato e
   * prontuário completo, além do botão de exportação reutilizável.
   *
   * Foi extraído integralmente do arquivo monolítico patients/[id].tsx
   * (linhas 84-1017) para reduzir tamanho do arquivo principal e isolar a
   * lógica de geração de documento HTML, que é puramente do domínio de
   * impressão e não compartilha estado com os tabs.
   */

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function fetchClinicForPrint(): Promise<ClinicInfo | null> {
  try {
    const token = localStorage.getItem("fisiogest_token");
    const r = await fetch("/api/clinics/current", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export function buildClinicHeaderHTML(clinic?: ClinicInfo | null): string {
  if (!clinic) {
    return `<div class="header"><h1 style="display:none"></h1></div>`;
  }
  const isAutonomo = clinic.type === "autonomo";
  const docId = isAutonomo
    ? clinic.cpf
      ? `CPF: ${clinic.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`
      : ""
    : clinic.cnpj
      ? `CNPJ: ${clinic.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}`
      : "";
  const council = clinic.crefito ? clinic.crefito : "";
  const rt = !isAutonomo && clinic.responsibleTechnical ? `RT: ${clinic.responsibleTechnical}${council ? ` · ${council}` : ""}` : "";
  const contactParts = [clinic.phone, clinic.email, clinic.address, clinic.website].filter(Boolean);
  const contactLine = contactParts.join(" · ");
  const logoHtml = clinic.logoUrl
    ? `<img src="${clinic.logoUrl}" alt="Logo" style="max-height:56px;max-width:180px;object-fit:contain;" />`
    : "";
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d4ed8;padding-bottom:12px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:14px">
        ${logoHtml}
        <div>
          <div style="font-size:15pt;font-weight:bold;color:#1e293b;letter-spacing:0.5px">${clinic.name}</div>
          <div style="font-size:8.5pt;color:#64748b;margin-top:2px">${[docId, isAutonomo && council ? council : "", rt].filter(Boolean).join(" · ")}</div>
          ${contactLine ? `<div style="font-size:8pt;color:#94a3b8;margin-top:1px">${contactLine}</div>` : ""}
        </div>
      </div>
    </div>`;
}

export function printDocument(html: string, title: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Permita pop-ups para gerar o documento."); return; }
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#111;background:#fff;padding:2cm 2.5cm}
    h1{font-size:15pt;font-weight:bold;text-align:center;margin-bottom:4px}
    .header{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:18px}
    .subtitle{font-size:10pt;color:#333;text-align:center;margin-bottom:4px}
    .patient-box{border:1px solid #999;border-radius:4px;padding:10px 14px;margin-bottom:16px;background:#fafafa}
    .row{display:flex;gap:24px;flex-wrap:wrap;margin-top:4px}
    .field{flex:1;min-width:140px}
    .label{font-size:8.5pt;text-transform:uppercase;color:#555;font-weight:bold;margin-bottom:1px}
    .value{font-size:10.5pt}
    .section{margin-bottom:14px}
    .section-title{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#333;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:8px}
    .content-box{background:#f5f5f5;border-radius:3px;padding:8px 12px;line-height:1.6;white-space:pre-wrap;font-size:10.5pt}
    .evo-card{border:1px solid #ddd;border-radius:4px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
    .evo-num{display:inline-flex;align-items:center;justify-content:center;background:#1d4ed8;color:#fff;border-radius:50%;width:22px;height:22px;font-size:9pt;font-weight:bold;margin-right:8px;flex-shrink:0}
    .evo-date{font-size:9pt;color:#666}
    .evo-field{margin-top:6px}
    .fl{font-size:8.5pt;font-weight:bold;color:#555;margin-bottom:1px}
    .fv{font-size:10pt;line-height:1.5}
    .progress-bar{background:#e5e7eb;height:10px;border-radius:5px;margin:6px 0}
    .progress-fill{background:#1d4ed8;height:10px;border-radius:5px}
    .sessions-table{width:100%;border-collapse:collapse;margin-top:8px}
    .sessions-table th{background:#1d4ed8;color:#fff;font-size:9pt;padding:5px 8px;text-align:left}
    .sessions-table td{border:1px solid #e5e7eb;font-size:10pt;padding:5px 8px}
    .sessions-table tr:nth-child(even) td{background:#f9fafb}
    .signature{margin-top:40px;text-align:center}
    .sig-line{border-top:1px solid #000;display:inline-block;width:220px;margin-bottom:4px}
    .sig-label{font-size:9.5pt;color:#444}
    .footer{margin-top:28px;border-top:1px solid #ccc;padding-top:8px;font-size:8pt;color:#888;text-align:center}
    p{margin-bottom:6px;line-height:1.5}
    @media print{@page{size:A4;margin:1.5cm}body{padding:0}}
  </style></head>
  <body>${html}<script>window.onload=function(){setTimeout(function(){window.print();},400);}</script></body></html>`);
  w.document.close();
}

export function generateDischargeHTML(patient: PatientBasic, discharge: Record<string, string>, professional?: { name?: string; council?: string }, clinic?: ClinicInfo | null) {
  const age = patient.birthDate ? differenceInYears(todayBRTDate(), parseISO(patient.birthDate)) : null;
  const ageStr = age ? `, ${age} anos` : "";
  const cpfFmt = patient.cpf ? patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const dischargeDate = discharge.dischargeDate
    ? format(parseISO(discharge.dischargeDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
    : today;
  const profCouncil = professional?.council || clinic?.crefito || "";
  const profName = professional?.name || clinic?.responsibleTechnical || "Fisioterapeuta Responsável";
  const clinicName = clinic?.name || "FisioGest Pro";
  return `
    ${buildClinicHeaderHTML(clinic)}
    <div class="header" style="margin-bottom:12px"><h1>ALTA FISIOTERAPÊUTICA</h1><div class="subtitle">Documento Clínico — Requisito COFFITO</div></div>
    <div class="patient-box">
      <div class="row">
        <div class="field"><div class="label">Paciente</div><div class="value"><strong>${patient.name}${ageStr}</strong></div></div>
        <div class="field"><div class="label">CPF</div><div class="value">${cpfFmt}</div></div>
        ${patient.phone ? `<div class="field"><div class="label">Telefone</div><div class="value">${patient.phone}</div></div>` : ""}
      </div>
      ${patient.birthDate ? `<div class="row"><div class="field"><div class="label">Data de Nascimento</div><div class="value">${format(parseISO(patient.birthDate), "dd/MM/yyyy")}</div></div></div>` : ""}
    </div>
    <div class="section"><div class="section-title">Data da Alta</div><p>${dischargeDate}</p></div>
    <div class="section"><div class="section-title">Motivo da Alta</div><div class="content-box">${discharge.dischargeReason || "—"}</div></div>
    ${discharge.achievedResults ? `<div class="section"><div class="section-title">Resultados Alcançados</div><div class="content-box">${discharge.achievedResults}</div></div>` : ""}
    ${discharge.recommendations ? `<div class="section"><div class="section-title">Recomendações ao Paciente</div><div class="content-box">${discharge.recommendations}</div></div>` : ""}
    <div class="signature">
      <div><div class="sig-line"></div></div>
      <div class="sig-label">${profName}</div>
      ${profCouncil ? `<div class="sig-label">${profCouncil}</div>` : ""}
    </div>
    <div class="footer">Documento emitido em ${today} &bull; ${clinicName}</div>
  `;
}

export function generateEvolutionsHTML(patient: PatientBasic, evolutions: any[], appointments: any[], clinic?: ClinicInfo | null) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const cpfFmt = patient.cpf ? patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";
  const clinicName = clinic?.name || "FisioGest Pro";
  const sortedAppts = [...appointments].sort((a, b) =>
    new Date(a.date + "T" + (a.startTime || "00:00")).getTime() - new Date(b.date + "T" + (b.startTime || "00:00")).getTime()
  );
  const cards = evolutions.map((ev, idx) => {
    const linkedAppt = appointments.find((a) => a.id === ev.appointmentId);
    let sessionNum = evolutions.length - idx;
    if (ev.appointmentId) { const pos = sortedAppts.findIndex((a) => a.id === ev.appointmentId); if (pos !== -1) sessionNum = pos + 1; }
    const dateStr = ev.createdAt ? format(new Date(ev.createdAt), "dd/MM/yyyy HH:mm") : "";
    const apptInfo = linkedAppt ? `📅 Consulta: ${format(parseISO(linkedAppt.date), "dd/MM/yyyy")} — ${linkedAppt.startTime || ""}` : "";

    const painScaleVal = ev.painScale !== null && ev.painScale !== undefined ? Number(ev.painScale) : null;
    let painHtml = "";
    if (painScaleVal !== null) {
      const painColor = painScaleVal >= 7 ? "#dc2626" : painScaleVal >= 4 ? "#f97316" : "#16a34a";
      const painLabel = painScaleVal === 0 ? "Sem dor" : painScaleVal <= 3 ? "Dor leve" : painScaleVal <= 6 ? "Dor moderada" : painScaleVal <= 9 ? "Dor intensa" : "Dor insuportável";
      const barWidth = Math.round((painScaleVal / 10) * 100);
      painHtml = `<div class="evo-field" style="margin-bottom:8px">
        <div class="fl">Escala de Dor (EVA)</div>
        <div class="fv" style="display:flex;align-items:center;gap:8px;margin-top:3px">
          <div style="flex:1;background:#e5e7eb;height:8px;border-radius:4px;overflow:hidden">
            <div style="width:${barWidth}%;background:${painColor};height:8px;border-radius:4px"></div>
          </div>
          <span style="font-weight:bold;color:${painColor};font-size:13pt;min-width:36px;text-align:right">${painScaleVal}/10</span>
          <span style="color:${painColor};font-size:9pt">(${painLabel})</span>
        </div>
      </div>`;
    }

    return `<div class="evo-card">
      <div style="display:flex;align-items:center;margin-bottom:8px">
        <span class="evo-num">${sessionNum}</span>
        <strong>Sessão ${sessionNum}</strong>
        <span class="evo-date" style="margin-left:auto">${dateStr}</span>
      </div>
      ${apptInfo ? `<div style="font-size:9pt;color:#1d4ed8;margin-bottom:6px">${apptInfo}</div>` : ""}
      ${painHtml}
      ${ev.description ? `<div class="evo-field"><div class="fl">Descrição da Sessão</div><div class="fv">${ev.description}</div></div>` : ""}
      ${ev.patientResponse ? `<div class="evo-field"><div class="fl">Resposta do Paciente</div><div class="fv">${ev.patientResponse}</div></div>` : ""}
      ${ev.clinicalNotes ? `<div class="evo-field"><div class="fl">Notas Clínicas</div><div class="fv">${ev.clinicalNotes}</div></div>` : ""}
      ${ev.complications ? `<div class="evo-field"><div class="fl">Intercorrências</div><div class="fv">${ev.complications}</div></div>` : ""}
    </div>`;
  }).join("");
  return `
    ${buildClinicHeaderHTML(clinic)}
    <div class="header" style="margin-bottom:12px"><h1>EVOLUÇÕES FISIOTERAPÊUTICAS</h1><div class="subtitle">Prontuário de Evoluções de Sessão</div></div>
    <div class="patient-box">
      <div class="row">
        <div class="field"><div class="label">Paciente</div><div class="value"><strong>${patient.name}</strong></div></div>
        <div class="field"><div class="label">CPF</div><div class="value">${cpfFmt}</div></div>
        <div class="field"><div class="label">Total de Evoluções</div><div class="value">${evolutions.length}</div></div>
      </div>
    </div>
    ${cards}
    <div class="footer">Documento emitido em ${today} &bull; ${clinicName}</div>
  `;
}

export function generatePlanHTML(
  patient: PatientBasic,
  plan: { objectives?: string; techniques?: string; frequency?: string; estimatedSessions?: string | number; status?: string; startDate?: string; responsibleProfessional?: string },
  appointments: any[],
  planItems: PlanProcedureItem[] = [],
  clinic?: ClinicInfo | null
) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const clinicName = clinic?.name || "FisioGest Pro";
  const completedAppts = [...appointments].filter((a) => a.status === "concluido" || a.status === "presenca")
    .sort((a, b) => new Date(b.date + "T" + (b.startTime || "00:00")).getTime() - new Date(a.date + "T" + (a.startTime || "00:00")).getTime());
  const totalCompleted = completedAppts.length;
  const estimated = plan.estimatedSessions ? Number(plan.estimatedSessions) : 0;
  const pct = estimated > 0 ? Math.min(100, (totalCompleted / estimated) * 100) : 0;
  const statusLabel: Record<string, string> = { ativo: "Ativo", concluido: "Concluído", suspenso: "Suspenso" };

  function fmtC(v: any) {
    if (v === null || v === undefined) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
  }

  const itemRows = planItems.map((item) => {
    const isMensal = item.packageType === "mensal";
    const isAvulso = !item.packageId;
    const disc = Number(item.discount ?? 0);
    const price = Number(item.price ?? 0);
    const gross = isMensal ? Number(item.monthlyPrice ?? price) : isAvulso ? price * (item.totalSessions ?? 1) : price;
    const net = Math.max(0, gross - disc);
    const used = item.usedSessions ?? 0;
    const planned = item.totalSessions ?? (isMensal ? (item.sessionsPerWeek * 4) : 0);
    const pctItem = planned > 0 ? Math.min(100, (used / planned) * 100) : 0;
    const badge = isMensal ? "Mensal" : isAvulso ? "Avulso" : "Pacote";
    const label = item.packageName ?? item.procedureName ?? "—";
    const sessInfo = isMensal
      ? `${item.sessionsPerWeek}x/sem (~${item.sessionsPerWeek * 4}/mês)`
      : item.totalSessions ? `${item.totalSessions} sessões · ${item.sessionsPerWeek}x/sem` : "—";
    const valueInfo = isMensal ? `${fmtC(net)}/mês` : `${fmtC(net)}${disc > 0 ? ` (desc. ${fmtC(disc)})` : ""}`;
    const progressBar = planned > 0
      ? `<div style="margin-top:4px"><div style="font-size:8pt;color:#555">${used}/${planned} sessões realizadas</div><div style="background:#e5e7eb;height:6px;border-radius:3px;margin:3px 0"><div style="background:${pctItem >= 100 ? "#16a34a" : "#1d4ed8"};height:6px;border-radius:3px;width:${pctItem.toFixed(0)}%"></div></div></div>`
      : "";
    return `<tr><td><strong>${label}</strong><br/><span style="font-size:8pt;color:#6b7280">${badge}</span>${progressBar}</td><td style="text-align:center">${sessInfo}</td><td style="text-align:right">${valueInfo}</td></tr>`;
  }).join("");

  const rows = completedAppts.map((a, i) => `<tr>
    <td>${totalCompleted - i}</td>
    <td>${format(parseISO(a.date), "dd/MM/yyyy")}</td>
    <td>${a.startTime || "—"}</td>
    <td>${a.procedure?.name || "—"}</td>
  </tr>`).join("");

  return `
    ${buildClinicHeaderHTML(clinic)}
    <div class="header" style="margin-bottom:12px"><h1>PLANO DE TRATAMENTO FISIOTERAPÊUTICO</h1><div class="subtitle">Documento Clínico</div></div>
    <div class="patient-box">
      <div class="row">
        <div class="field"><div class="label">Paciente</div><div class="value"><strong>${patient.name}</strong></div></div>
        <div class="field"><div class="label">Status</div><div class="value">${statusLabel[plan.status || "ativo"] || "Ativo"}</div></div>
        ${plan.frequency ? `<div class="field"><div class="label">Frequência</div><div class="value">${plan.frequency}</div></div>` : ""}
        ${plan.startDate ? `<div class="field"><div class="label">Data de Início</div><div class="value">${format(parseISO(plan.startDate), "dd/MM/yyyy")}</div></div>` : ""}
      </div>
      ${plan.responsibleProfessional ? `<div class="row"><div class="field"><div class="label">Profissional Responsável</div><div class="value">${plan.responsibleProfessional}</div></div></div>` : ""}
    </div>
    ${plan.objectives ? `<div class="section"><div class="section-title">Objetivos do Tratamento</div><div class="content-box">${plan.objectives}</div></div>` : ""}
    ${plan.techniques ? `<div class="section"><div class="section-title">Técnicas e Recursos</div><div class="content-box">${plan.techniques}</div></div>` : ""}
    <div class="section">
      <div class="section-title">Progresso de Sessões</div>
      <p><strong>${totalCompleted}</strong> sessão(ões) concluída(s) de <strong>${estimated || "—"}</strong> estimada(s)</p>
      ${estimated > 0 ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(0)}%"></div></div><p style="font-size:9pt;color:#555">${pct.toFixed(1)}% concluído</p>` : ""}
    </div>
    ${itemRows ? `<div class="section"><div class="section-title">Procedimentos e Pacotes do Plano</div>
      <table class="sessions-table"><thead><tr><th>Procedimento / Pacote</th><th style="text-align:center">Sessões</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>${itemRows}</tbody></table></div>` : ""}
    ${rows ? `<div class="section"><div class="section-title">Histórico de Sessões</div>
      <table class="sessions-table"><thead><tr><th>#</th><th>Data</th><th>Horário</th><th>Procedimento</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : ""}
    <div class="footer">Documento emitido em ${today} &bull; ${clinicName}</div>
  `;
}

export function extractCityState(address: string | null | undefined): string {
  if (!address) return "_______________";
  const withoutCep = address.replace(/,?\s*\d{5}-?\d{3}\s*$/, "").trim();
  const parts = withoutCep.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return address;
  return parts[parts.length - 1];
}

export function generateContractHTML(
  patient: PatientBasic,
  plan: { objectives?: string; techniques?: string; frequency?: string; estimatedSessions?: string | number; status?: string; startDate?: string; responsibleProfessional?: string },
  planItems: PlanProcedureItem[],
  clinic?: ClinicInfo | null
) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const cpfFmt = patient.cpf ? patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";
  const clinicName = clinic?.name || "FisioGest Pro";
  const clinicCrefito = clinic?.crefito || "";
  const clinicRT = clinic?.responsibleTechnical || "";

  function fmtC(v: any) {
    if (v === null || v === undefined) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
  }

  let totalSessoesVal = 0;
  let totalMensalVal = 0;
  let totalDisconto = 0;

  const itemRows = planItems.map((item) => {
    const isMensal = item.packageType === "mensal";
    const isAvulso = !item.packageId;
    const sessionCount = item.totalSessions ?? 0;
    const disc = Number(item.discount ?? 0);
    const unitP = Number(item.price ?? 0);
    const unitM = Number(item.monthlyPrice ?? 0);

    const gross = isMensal
      ? unitM
      : isAvulso
        ? unitP * (sessionCount || 1)
        : unitP;
    const net = Math.max(0, gross - disc);

    totalDisconto += disc;
    if (isMensal) totalMensalVal += net;
    else { totalSessoesVal += net; }

    const label = item.packageName ?? item.procedureName ?? "—";
    const badge = isMensal ? "Mensal" : isAvulso ? "Avulso" : "Pacote Sessões";
    const sessInfo = isMensal
      ? `${item.sessionsPerWeek}x/sem (~${item.sessionsPerWeek * 4}/mês)`
      : sessionCount > 0
        ? `${sessionCount} sessões · ${item.sessionsPerWeek ?? 1}x/sem`
        : "—";
    const weeks = (!isMensal && sessionCount > 0 && (item.sessionsPerWeek ?? 0) > 0)
      ? `~${Math.ceil(sessionCount / (item.sessionsPerWeek || 1))} sem.` : "—";

    const priceDetail = isMensal
      ? `${fmtC(unitM)}/mês`
      : isAvulso && sessionCount > 0
        ? `${fmtC(unitP)} × ${sessionCount} sessões`
        : fmtC(unitP);
    const discDetail = disc > 0 ? `<br/><span style="color:#16a34a;font-size:8pt">– Desconto: ${fmtC(disc)}</span>` : "";
    const netDetail = `<strong style="color:#1e40af">${fmtC(net)}${isMensal ? "/mês" : ""}</strong>${discDetail}`;

    return `<tr>
      <td><strong>${label}</strong><br/><span style="font-size:8pt;color:#6b7280">${badge}</span></td>
      <td style="text-align:center">${sessInfo}</td>
      <td style="text-align:center">${weeks}</td>
      <td style="text-align:right;font-size:9pt">${priceDetail}</td>
      <td style="text-align:right">${netDetail}</td>
    </tr>`;
  }).join("");

  const grandTotal = totalSessoesVal + totalMensalVal;

  const contratada = plan.responsibleProfessional || clinicRT || clinicName;
  const contratadaCouncil = clinicCrefito;

  const cancellationHours = clinic?.cancellationPolicyHours;
  const noShowFeeEnabled = clinic?.noShowFeeEnabled;
  const noShowFeeAmount = clinic?.noShowFeeAmount ? Number(clinic.noShowFeeAmount) : null;
  const fmtNoShowFee = noShowFeeAmount
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(noShowFeeAmount)
    : null;

  const clauseCancellation = cancellationHours && cancellationHours > 0
    ? `Os atendimentos serão realizados conforme agenda acordada. Cancelamentos ou reagendamentos devem ser comunicados com antecedência mínima de <strong>${cancellationHours} horas</strong>; solicitações fora desse prazo poderão ser tratadas como falta injustificada.`
    : `Os atendimentos serão realizados conforme agenda acordada, podendo ser reagendados mediante comunicação prévia de 24 horas.`;

  const clauseNoShow = noShowFeeEnabled && fmtNoShowFee
    ? `Faltas não justificadas dentro do prazo estabelecido serão cobradas mediante taxa de não comparecimento no valor de <strong>${fmtNoShowFee}</strong>, lançada automaticamente no sistema, exceto nos casos de crédito de falta previstos no pacote contratado.`
    : `Faltas não justificadas com antecedência mínima de 2 horas serão cobradas integralmente, exceto nos casos de crédito de falta previstos no pacote contratado.`;

  return `
    ${buildClinicHeaderHTML(clinic)}
    <div class="header" style="margin-bottom:12px">
      <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
      <div class="subtitle">Serviços de Reabilitação e Saúde</div>
    </div>

    <div class="section">
      <div class="section-title">Partes Contratantes</div>
      <div class="patient-box">
        <p style="font-size:9pt;font-weight:bold;margin-bottom:6px">CONTRATANTE (Paciente):</p>
        <div class="row">
          <div class="field"><div class="label">Nome Completo</div><div class="value"><strong>${patient.name}</strong></div></div>
          <div class="field"><div class="label">CPF</div><div class="value">${cpfFmt}</div></div>
          ${patient.phone ? `<div class="field"><div class="label">Telefone</div><div class="value">${patient.phone}</div></div>` : ""}
        </div>
        ${patient.birthDate ? `<div class="row"><div class="field"><div class="label">Data de Nascimento</div><div class="value">${format(parseISO(patient.birthDate), "dd/MM/yyyy")}</div></div></div>` : ""}
      </div>
      <div class="patient-box" style="margin-top:8px"><p style="font-size:9pt;font-weight:bold;margin-bottom:4px">CONTRATADA (Prestadora):</p><div class="row"><div class="field"><div class="label">Nome / Razão Social</div><div class="value"><strong>${clinicName}</strong></div></div>${contratadaCouncil ? `<div class="field"><div class="label">CREFITO / CREF</div><div class="value">${contratadaCouncil}</div></div>` : ""}${clinicRT && plan.responsibleProfessional !== clinicRT ? `<div class="field"><div class="label">Responsável Técnico</div><div class="value">${clinicRT}</div></div>` : ""}</div></div>
    </div>

    <div class="section">
      <div class="section-title">Objeto do Contrato — Plano de Tratamento</div>
      ${plan.objectives ? `<p><strong>Objetivos terapêuticos:</strong> ${plan.objectives}</p>` : ""}
      ${plan.techniques ? `<p><strong>Técnicas e recursos:</strong> ${plan.techniques}</p>` : ""}
      ${plan.frequency ? `<p><strong>Frequência:</strong> ${plan.frequency}</p>` : ""}
      ${plan.startDate ? `<p><strong>Data de início prevista:</strong> ${format(parseISO(plan.startDate), "dd/MM/yyyy")}</p>` : ""}
      ${plan.estimatedSessions ? `<p><strong>Total de sessões estimadas:</strong> ${plan.estimatedSessions} sessões</p>` : ""}
    </div>

    <div class="section">
      <div class="section-title">Serviços Contratados e Estimativa de Investimento</div>
      ${itemRows ? `
      <table class="sessions-table">
        <thead>
          <tr>
            <th>Serviço / Procedimento</th>
            <th style="text-align:center">Sessões</th>
            <th style="text-align:center">Duração</th>
            <th style="text-align:right">Preço Unitário</th>
            <th style="text-align:right">Valor c/ Desconto</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          ${totalDisconto > 0 ? `<tr><td colspan="4" style="text-align:right;color:#16a34a;font-weight:600">Total de descontos concedidos:</td><td style="text-align:right;color:#16a34a;font-weight:600">– ${fmtC(totalDisconto)}</td></tr>` : ""}
          ${totalSessoesVal > 0 ? `<tr><td colspan="4" style="text-align:right;font-weight:600">Subtotal (sessões/pacotes):</td><td style="text-align:right;font-weight:600">${fmtC(totalSessoesVal)}</td></tr>` : ""}
          ${totalMensalVal > 0 ? `<tr><td colspan="4" style="text-align:right;font-weight:600">Mensalidade recorrente:</td><td style="text-align:right;font-weight:600">${fmtC(totalMensalVal)}/mês</td></tr>` : ""}
          <tr style="background:#eff6ff"><td colspan="4" style="text-align:right;font-weight:700;color:#1e40af;font-size:10pt">TOTAL ESTIMADO DO PLANO:</td><td style="text-align:right;font-weight:700;color:#1e40af;font-size:11pt">${fmtC(grandTotal)}${totalMensalVal > 0 && totalSessoesVal > 0 ? `<br/><span style="font-size:8pt;font-weight:400">+ ${fmtC(totalMensalVal)}/mês</span>` : ""}</td></tr>
        </tfoot>
      </table>
      ` : "<p>Nenhum serviço vinculado ao plano.</p>"}
      <p style="font-size:8pt;color:#6b7280;margin-top:8px">* Os valores acima são os acordados na contratação do plano. Alterações somente mediante aditivo contratual.</p>
    </div>

    <div class="section">
      <div class="section-title">Cláusulas Gerais</div>
      <ol style="font-size:9pt;line-height:1.7;color:#374151">
        <li>O presente contrato tem por objeto a prestação de serviços de fisioterapia descritos no plano de tratamento acima, com os valores expressamente acordados entre as partes.</li>
        <li>${clauseCancellation}</li>
        <li>${clauseNoShow}</li>
        <li>Os valores fixados neste contrato vigorarão pelo período do plano, podendo ser reajustados por renovação ou aditivo com acordo de ambas as partes.</li>
        <li>O contratante autoriza o uso de dados pessoais e clínicos exclusivamente para fins de acompanhamento terapêutico, em conformidade com a LGPD (Lei 13.709/2018).</li>
        <li>As informações clínicas são sigilosas e regidas pelo Código de Ética do COFFITO.</li>
        <li>Qualquer rescisão deverá ser comunicada por escrito com antecedência mínima de 15 dias corridos.</li>
        <li>O presente instrumento é firmado em duas vias de igual teor e forma.</li>
      </ol>
    </div>

    <p style="font-size:9pt;color:#374151;margin-top:16px">Emitido em ${today}, ${extractCityState(clinic?.address)}.</p>

    <div style="margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:40px">
      <div>
        <div class="sig-line"></div>
        <div class="sig-label"><strong>${patient.name}</strong></div>
        <div class="sig-label">CPF: ${cpfFmt}</div>
        <div class="sig-label">Contratante</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">${plan.responsibleProfessional || "Fisioterapeuta / Prestador de Serviço"}</div>
        <div class="sig-label">Contratada</div>
      </div>
    </div>

    <div class="footer">Contrato gerado em ${today} &bull; ${clinicName} &bull; Valores acordados na contratação do plano</div>
  `;
}

// ─── Full Prontuário HTML Generator ─────────────────────────────────────────

interface ProntuarioData {
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
    new Date(b.date + "T" + (b.startTime || "00:00")).getTime()
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

// ─── Export Prontuário Button ────────────────────────────────────────────────

export function ExportProntuarioButton({ patientId, patient }: { patientId: number; patient: any }) {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const token = () => localStorage.getItem("fisiogest_token");

  const handleExport = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const [anamnesisRes, evaluationsRes, planRes, evolutionsRes, appointmentsRes, dischargeRes, clinicRes] = await Promise.all([
        fetch(`/api/patients/${patientId}/anamnesis`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`/api/patients/${patientId}/evaluations`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`/api/patients/${patientId}/treatment-plan`, { headers }).then(r => r.ok ? r.json() : null),
        fetch(`/api/patients/${patientId}/evolutions`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`/api/patients/${patientId}/appointments`, { headers }).then(r => r.ok ? r.json() : []),
        fetch(`/api/patients/${patientId}/discharge-summary`, { headers }).then(r => r.ok ? r.json() : null),
        fetchClinicForPrint(),
      ]);

      const { html, css } = generateFullProntuarioHTML({
        patient,
        anamnesis: anamnesisRes,
        evaluations: evaluationsRes,
        treatmentPlan: planRes,
        evolutions: evolutionsRes,
        appointments: appointmentsRes,
        discharge: dischargeRes,
        professional: { name: (user as any)?.name },
        clinic: clinicRes,
      });

      const w = window.open("", "_blank", "width=960,height=800");
      if (!w) { alert("Permita pop-ups para gerar o prontuário."); return; }
      w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
        <meta charset="UTF-8"><title>Prontuário — ${patient.name}</title>
        <style>${css}</style>
      </head><body>${html}
        <script>window.onload=function(){setTimeout(function(){window.print();},600);}<\/script>
      </body></html>`);
      w.document.close();
    } catch (err) {
      console.error("Erro ao gerar prontuário:", err);
      alert("Não foi possível gerar o prontuário. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className="w-full h-9 rounded-xl text-sm border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400"
      onClick={handleExport}
      disabled={loading}
    >
      {loading
        ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Gerando…</>
        : <><FileText className="w-3.5 h-3.5 mr-2" /> Exportar Prontuário PDF</>
      }
    </Button>
  );
}
