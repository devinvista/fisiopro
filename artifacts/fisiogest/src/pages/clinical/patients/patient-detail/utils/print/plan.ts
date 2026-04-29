import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PatientBasic, ClinicInfo, PlanProcedureItem } from "../../types";
import { todayBRTDate } from "../format";
import { plannedSessionsForItem } from "../sessionCount";
import { buildClinicHeaderHTML, fmtCurrency } from "./_shared";

const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  presenca: "Presente",
  faltou: "Falta",
  cancelado: "Cancelado",
};

const STATUS_BADGE: Record<string, { bg: string; fg: string }> = {
  agendado: { bg: "#dbeafe", fg: "#1e40af" },
  confirmado: { bg: "#dcfce7", fg: "#15803d" },
  concluido: { bg: "#d1fae5", fg: "#065f46" },
  presenca: { bg: "#d1fae5", fg: "#065f46" },
  faltou: { bg: "#fee2e2", fg: "#b91c1c" },
  cancelado: { bg: "#f1f5f9", fg: "#475569" },
};

function statusBadge(status: string): string {
  const s = STATUS_BADGE[status] ?? { bg: "#f1f5f9", fg: "#475569" };
  const label = STATUS_LABEL[status] ?? status;
  return `<span style="display:inline-block;background:${s.bg};color:${s.fg};border-radius:10px;padding:2px 8px;font-size:8.5pt;font-weight:600;letter-spacing:.2px">${label}</span>`;
}

function todayISO(): string {
  const d = todayBRTDate();
  return d.toISOString().slice(0, 10);
}

function fmtDateBR(s: string): string {
  try { return format(parseISO(s), "dd/MM/yyyy"); } catch { return s; }
}

function fmtDateLongBR(s: string): string {
  try { return format(parseISO(s), "EEE, dd/MM/yyyy", { locale: ptBR }); } catch { return s; }
}

export function generatePlanHTML(
  patient: PatientBasic,
  plan: { objectives?: string; techniques?: string; frequency?: string; estimatedSessions?: string | number; status?: string; startDate?: string; responsibleProfessional?: string; durationMonths?: number | null },
  appointments: any[],
  planItems: PlanProcedureItem[] = [],
  clinic?: ClinicInfo | null,
) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const todayIso = todayISO();
  const clinicName = clinic?.name || "FisioGest Pro";

  // ── Filtra agendamentos vinculados a este plano (quando possível) ──────────
  // Se há itens, restringe aos appointments materializados deste plano. Caso
  // contrário (plano legado sem itens carregados), usa todos do paciente.
  const planItemIds = new Set(planItems.map((i) => i.id));
  const relevant: any[] = planItems.length > 0
    ? appointments.filter((a) => a.treatmentPlanProcedureId != null && planItemIds.has(a.treatmentPlanProcedureId))
    : appointments;

  // ── Buckets por status ────────────────────────────────────────────────────
  const upcoming = relevant
    .filter((a) => (a.status === "agendado" || a.status === "confirmado") && (a.date ?? "") >= todayIso)
    .sort((a, b) => (a.date + (a.startTime ?? "")).localeCompare(b.date + (b.startTime ?? "")));

  const completed = relevant
    .filter((a) => a.status === "concluido" || a.status === "presenca")
    .sort((a, b) => (b.date + (b.startTime ?? "")).localeCompare(a.date + (a.startTime ?? "")));

  const missed = relevant
    .filter((a) => a.status === "faltou" || a.status === "cancelado")
    .sort((a, b) => (b.date + (b.startTime ?? "")).localeCompare(a.date + (a.startTime ?? "")));

  const totalCompleted = completed.length;
  const totalUpcoming = upcoming.length;
  const totalMissed = missed.length;

  // ── Métricas de progresso ─────────────────────────────────────────────────
  const planMonths = Math.max(1, Number(plan.durationMonths ?? 12));
  const planStart = plan.startDate ?? null;
  const sumPlannedFromItems = planItems.reduce(
    (acc, it) => acc + plannedSessionsForItem(it, planStart, planMonths),
    0,
  );
  const estimatedFromPlan = plan.estimatedSessions ? Number(plan.estimatedSessions) : 0;
  const totalEstimated = sumPlannedFromItems > 0 ? sumPlannedFromItems : estimatedFromPlan;
  const pct = totalEstimated > 0 ? Math.min(100, (totalCompleted / totalEstimated) * 100) : 0;

  // ── Totais financeiros (mesma lógica do contrato para consistência) ───────
  let totalSessoesVal = 0;
  let totalMensalVal = 0;
  let totalDesconto = 0;
  for (const it of planItems) {
    const isMensal = it.packageType === "mensal";
    const isAvulso = !it.packageId;
    const sessionCount = it.totalSessions ?? (isAvulso ? 1 : 0);
    const disc = Number(it.discount ?? 0);
    const unitP = Number(it.price ?? 0);
    const unitM = isMensal ? Number(it.monthlyPrice ?? it.price ?? 0) : 0;
    const gross = isMensal ? unitM : isAvulso ? unitP * sessionCount : unitP;
    const net = Math.max(0, gross - disc);
    totalDesconto += disc;
    if (isMensal) totalMensalVal += net; else totalSessoesVal += net;
  }
  const hasMensal = totalMensalVal > 0;
  const hasSessoes = totalSessoesVal > 0;

  // ── Status do plano (badge no hero) ───────────────────────────────────────
  const statusKey = plan.status ?? "ativo";
  const statusLabel = ({ ativo: "Ativo", concluido: "Concluído", suspenso: "Suspenso" } as Record<string, string>)[statusKey] ?? "Ativo";
  const statusColor = statusKey === "ativo" ? "#15803d" : statusKey === "concluido" ? "#1e40af" : "#92400e";
  const statusBg = statusKey === "ativo" ? "#dcfce7" : statusKey === "concluido" ? "#dbeafe" : "#fef3c7";

  // ── Hero panel ────────────────────────────────────────────────────────────
  const investmentLine = (() => {
    if (hasSessoes && hasMensal) return `${fmtCurrency(totalSessoesVal)} <span style="font-size:9pt">à vista</span> + ${fmtCurrency(totalMensalVal)}<span style="font-size:9pt">/mês</span>`;
    if (hasMensal) return `${fmtCurrency(totalMensalVal)}<span style="font-size:9pt">/mês</span>`;
    if (hasSessoes) return fmtCurrency(totalSessoesVal);
    return "—";
  })();

  const heroHtml = `
    <div style="background:linear-gradient(135deg,#1e40af 0%,#1d4ed8 100%);color:#fff;border-radius:8px;padding:16px 20px;margin-bottom:16px;page-break-inside:avoid">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div style="flex:1;min-width:0">
          <div style="font-size:9pt;text-transform:uppercase;letter-spacing:1px;opacity:.8">Plano de Tratamento</div>
          <div style="font-size:17pt;font-weight:700;margin-top:2px;line-height:1.15">${patient.name}</div>
          <div style="font-size:9pt;opacity:.85;margin-top:2px">
            ${plan.responsibleProfessional ? `Resp.: <strong>${plan.responsibleProfessional}</strong>` : ""}
            ${plan.startDate ? ` &bull; Início: <strong>${fmtDateBR(plan.startDate)}</strong>` : ""}
            ${plan.frequency ? ` &bull; ${plan.frequency}` : ""}
          </div>
        </div>
        <div style="background:${statusBg};color:${statusColor};border-radius:14px;padding:4px 12px;font-size:9pt;font-weight:700;letter-spacing:.3px">${statusLabel}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px">
        ${heroMetric("Realizadas", String(totalCompleted), totalEstimated > 0 ? `de ${totalEstimated}` : undefined)}
        ${heroMetric("Próximas", String(totalUpcoming), totalUpcoming > 0 ? "agendadas" : "nenhuma agendada")}
        ${heroMetric("Conclusão", totalEstimated > 0 ? `${pct.toFixed(0)}%` : "—", totalEstimated > 0 ? `de ${totalEstimated} sessões` : "sem meta definida")}
        ${heroMetric("Investimento", investmentLine, totalDesconto > 0 ? `desc. ${fmtCurrency(totalDesconto)}` : undefined)}
      </div>
      ${totalEstimated > 0 ? `
        <div style="background:rgba(255,255,255,0.18);height:8px;border-radius:4px;margin-top:14px;overflow:hidden">
          <div style="background:#fff;height:8px;border-radius:4px;width:${pct.toFixed(0)}%"></div>
        </div>
      ` : ""}
    </div>
  `;

  // ── Items table (procedimentos do plano) ──────────────────────────────────
  const itemRows = planItems.map((item) => {
    const isMensal = item.packageType === "mensal";
    const isAvulso = !item.packageId;
    const disc = Number(item.discount ?? 0);
    const price = Number(item.price ?? 0);
    const gross = isMensal ? Number(item.monthlyPrice ?? price) : isAvulso ? price * (item.totalSessions ?? 1) : price;
    const net = Math.max(0, gross - disc);
    const used = item.usedSessions ?? 0;
    const planned = plannedSessionsForItem(item, planStart, planMonths);
    const pctItem = planned > 0 ? Math.min(100, (used / planned) * 100) : 0;
    const badge = isMensal ? "Mensal" : isAvulso ? "Avulso" : "Pacote";
    const label = item.packageName ?? item.procedureName ?? "—";
    const sessInfo = isMensal
      ? `${item.sessionsPerWeek}x/sem · ${planned} sessões em ${planMonths} ${planMonths === 1 ? "mês" : "meses"}`
      : item.totalSessions ? `${item.totalSessions} sessões · ${item.sessionsPerWeek ?? 1}x/sem` : "—";
    const valueInfo = isMensal
      ? `${fmtCurrency(net)}<span style="font-size:8pt">/mês</span>${disc > 0 ? `<br/><span style="color:#16a34a;font-size:8pt">– desc. ${fmtCurrency(disc)}</span>` : ""}`
      : `${fmtCurrency(net)}${disc > 0 ? `<br/><span style="color:#16a34a;font-size:8pt">– desc. ${fmtCurrency(disc)}</span>` : ""}`;
    const progressBar = planned > 0
      ? `<div style="margin-top:6px"><div style="font-size:8pt;color:#475569;margin-bottom:2px">${used}/${planned} sessões realizadas</div><div style="background:#e5e7eb;height:5px;border-radius:3px"><div style="background:${pctItem >= 100 ? "#16a34a" : "#1d4ed8"};height:5px;border-radius:3px;width:${pctItem.toFixed(0)}%"></div></div></div>`
      : "";
    return `<tr>
      <td><strong>${label}</strong><br/><span style="font-size:8pt;color:#6b7280">${badge}</span>${progressBar}</td>
      <td style="text-align:center">${sessInfo}</td>
      <td style="text-align:right;font-weight:600">${valueInfo}</td>
    </tr>`;
  }).join("");

  const itemsTotalsFooter = (hasMensal || hasSessoes || totalDesconto > 0) ? `
    <tfoot>
      ${totalDesconto > 0 ? `<tr><td colspan="2" style="text-align:right;color:#16a34a;font-weight:600;font-size:9pt">Total de descontos:</td><td style="text-align:right;color:#16a34a;font-weight:600;font-size:9pt">– ${fmtCurrency(totalDesconto)}</td></tr>` : ""}
      ${hasSessoes ? `<tr><td colspan="2" style="text-align:right;font-weight:600">Subtotal sessões/pacotes:</td><td style="text-align:right;font-weight:600">${fmtCurrency(totalSessoesVal)}</td></tr>` : ""}
      ${hasMensal ? `<tr><td colspan="2" style="text-align:right;font-weight:600">Mensalidade recorrente:</td><td style="text-align:right;font-weight:600">${fmtCurrency(totalMensalVal)}/mês</td></tr>` : ""}
      <tr style="background:#eff6ff"><td colspan="2" style="text-align:right;font-weight:700;color:#1e40af">Investimento estimado:</td><td style="text-align:right;font-weight:700;color:#1e40af;font-size:11pt">${investmentLine}</td></tr>
    </tfoot>
  ` : "";

  // ── Próximos atendimentos ─────────────────────────────────────────────────
  const upcomingRows = upcoming.slice(0, 60).map((a) => `<tr>
    <td style="white-space:nowrap"><strong>${fmtDateLongBR(a.date)}</strong></td>
    <td style="text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums">${a.startTime ?? "—"}${a.endTime ? `<span style="color:#94a3b8"> · ${a.endTime}</span>` : ""}</td>
    <td>${a.procedure?.name ?? "—"}</td>
    <td style="text-align:center">${statusBadge(a.status)}</td>
  </tr>`).join("");

  const upcomingSection = upcomingRows ? `
    <div class="section">
      <div class="section-title">Próximos Atendimentos <span style="float:right;color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">${totalUpcoming} agendamento${totalUpcoming === 1 ? "" : "s"}</span></div>
      <table class="sessions-table">
        <thead><tr><th>Data</th><th style="text-align:center">Horário</th><th>Procedimento</th><th style="text-align:center">Situação</th></tr></thead>
        <tbody>${upcomingRows}</tbody>
      </table>
      ${upcoming.length > 60 ? `<p style="font-size:8pt;color:#64748b;margin-top:6px">Mostrando os próximos 60 de ${upcoming.length} atendimentos.</p>` : ""}
    </div>
  ` : "";

  // ── Sessões realizadas ────────────────────────────────────────────────────
  const completedRows = completed.map((a, i) => `<tr>
    <td style="text-align:center;width:30px;color:#64748b">${totalCompleted - i}</td>
    <td style="white-space:nowrap">${fmtDateBR(a.date)}</td>
    <td style="text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums">${a.startTime ?? "—"}</td>
    <td>${a.procedure?.name ?? "—"}</td>
    <td style="text-align:center">${statusBadge(a.status)}</td>
  </tr>`).join("");

  const completedSection = completedRows ? `
    <div class="section">
      <div class="section-title">Sessões Realizadas <span style="float:right;color:#64748b;font-weight:400;text-transform:none;letter-spacing:0">${totalCompleted} sessão${totalCompleted === 1 ? "" : "(ões)"}</span></div>
      <table class="sessions-table">
        <thead><tr><th style="text-align:center">#</th><th>Data</th><th style="text-align:center">Horário</th><th>Procedimento</th><th style="text-align:center">Situação</th></tr></thead>
        <tbody>${completedRows}</tbody>
      </table>
    </div>
  ` : "";

  // ── Faltas / cancelamentos ────────────────────────────────────────────────
  const missedRows = missed.map((a) => `<tr>
    <td style="white-space:nowrap;color:#64748b">${fmtDateBR(a.date)}</td>
    <td style="text-align:center;white-space:nowrap;color:#64748b">${a.startTime ?? "—"}</td>
    <td style="color:#475569">${a.procedure?.name ?? "—"}</td>
    <td style="text-align:center">${statusBadge(a.status)}</td>
  </tr>`).join("");

  const missedSection = missedRows ? `
    <div class="section">
      <div class="section-title" style="color:#94a3b8;border-bottom-color:#e2e8f0">Faltas e Cancelamentos <span style="float:right;color:#94a3b8;font-weight:400;text-transform:none;letter-spacing:0">${totalMissed}</span></div>
      <table class="sessions-table">
        <thead style="opacity:.85"><tr><th>Data</th><th style="text-align:center">Horário</th><th>Procedimento</th><th style="text-align:center">Motivo</th></tr></thead>
        <tbody>${missedRows}</tbody>
      </table>
    </div>
  ` : "";

  return `
    ${buildClinicHeaderHTML(clinic)}
    ${heroHtml}

    <div class="patient-box">
      <div class="row">
        <div class="field"><div class="label">Paciente</div><div class="value"><strong>${patient.name}</strong></div></div>
        ${patient.cpf ? `<div class="field"><div class="label">CPF</div><div class="value">${patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}</div></div>` : ""}
        ${patient.phone ? `<div class="field"><div class="label">Telefone</div><div class="value">${patient.phone}</div></div>` : ""}
      </div>
    </div>

    ${plan.objectives ? `<div class="section"><div class="section-title">Objetivos do Tratamento</div><div class="content-box">${plan.objectives}</div></div>` : ""}
    ${plan.techniques ? `<div class="section"><div class="section-title">Técnicas e Recursos</div><div class="content-box">${plan.techniques}</div></div>` : ""}

    ${itemRows ? `
      <div class="section">
        <div class="section-title">Procedimentos e Pacotes do Plano</div>
        <table class="sessions-table">
          <thead><tr><th>Procedimento / Pacote</th><th style="text-align:center">Sessões</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${itemRows}</tbody>
          ${itemsTotalsFooter}
        </table>
      </div>
    ` : ""}

    ${upcomingSection}
    ${completedSection}
    ${missedSection}

    ${(!upcomingRows && !completedRows && !missedRows) ? `
      <div class="section">
        <div class="section-title">Atendimentos</div>
        <div class="content-box" style="color:#64748b;font-style:italic">Nenhum atendimento vinculado a este plano até o momento.</div>
      </div>
    ` : ""}

    <div class="footer">Documento emitido em ${today} &bull; ${clinicName}</div>
  `;
}

function heroMetric(label: string, value: string, sub?: string): string {
  return `
    <div style="background:rgba(255,255,255,0.12);border-radius:6px;padding:8px 10px">
      <div style="font-size:7.5pt;text-transform:uppercase;letter-spacing:.8px;opacity:.85">${label}</div>
      <div style="font-size:14pt;font-weight:700;margin-top:2px;line-height:1.1">${value}</div>
      ${sub ? `<div style="font-size:7.5pt;opacity:.8;margin-top:1px">${sub}</div>` : ""}
    </div>
  `;
}
