import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PatientBasic, ClinicInfo } from "../../types";
import { todayBRTDate } from "../format";
import { buildClinicHeaderHTML } from "./_shared";

export function generateEvolutionsHTML(
  patient: PatientBasic,
  evolutions: any[],
  appointments: any[],
  clinic?: ClinicInfo | null,
) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const cpfFmt = patient.cpf ? patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";
  const clinicName = clinic?.name || "FisioGest Pro";
  const sortedAppts = [...appointments].sort((a, b) =>
    new Date(a.date + "T" + (a.startTime || "00:00")).getTime() - new Date(b.date + "T" + (b.startTime || "00:00")).getTime(),
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
