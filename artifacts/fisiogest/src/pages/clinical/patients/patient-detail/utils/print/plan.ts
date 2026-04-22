import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PatientBasic, ClinicInfo, PlanProcedureItem } from "../../types";
import { todayBRTDate } from "../format";
import { buildClinicHeaderHTML, fmtCurrency } from "./_shared";

export function generatePlanHTML(
  patient: PatientBasic,
  plan: { objectives?: string; techniques?: string; frequency?: string; estimatedSessions?: string | number; status?: string; startDate?: string; responsibleProfessional?: string },
  appointments: any[],
  planItems: PlanProcedureItem[] = [],
  clinic?: ClinicInfo | null,
) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const clinicName = clinic?.name || "FisioGest Pro";
  const completedAppts = [...appointments].filter((a) => a.status === "concluido" || a.status === "presenca")
    .sort((a, b) => new Date(b.date + "T" + (b.startTime || "00:00")).getTime() - new Date(a.date + "T" + (a.startTime || "00:00")).getTime());
  const totalCompleted = completedAppts.length;
  const estimated = plan.estimatedSessions ? Number(plan.estimatedSessions) : 0;
  const pct = estimated > 0 ? Math.min(100, (totalCompleted / estimated) * 100) : 0;
  const statusLabel: Record<string, string> = { ativo: "Ativo", concluido: "Concluído", suspenso: "Suspenso" };

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
    const valueInfo = isMensal ? `${fmtCurrency(net)}/mês` : `${fmtCurrency(net)}${disc > 0 ? ` (desc. ${fmtCurrency(disc)})` : ""}`;
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
