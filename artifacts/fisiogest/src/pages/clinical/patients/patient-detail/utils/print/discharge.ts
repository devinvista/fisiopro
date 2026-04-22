import { format, differenceInYears, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PatientBasic, ClinicInfo } from "../../types";
import { todayBRTDate } from "../format";
import { buildClinicHeaderHTML } from "./_shared";

export function generateDischargeHTML(
  patient: PatientBasic,
  discharge: Record<string, string>,
  professional?: { name?: string; council?: string },
  clinic?: ClinicInfo | null,
) {
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
