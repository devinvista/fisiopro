import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { PatientBasic, ClinicInfo, PlanProcedureItem } from "../../types";
import { todayBRTDate } from "../format";
import { buildClinicHeaderHTML, extractCityState, fmtCurrency } from "./_shared";

/**
 * Trilha de aceite renderizada no rodapé do contrato. Quando informada, a
 * linha de assinatura do paciente é substituída por uma caixa "assinado
 * digitalmente / presencialmente" exibindo nome digitado, data, IP e
 * dispositivo (LGPD). O termo de aceite e o contrato são o **mesmo
 * documento** — antes assinado mostra a linha em branco; depois assinado
 * mostra a trilha imutável.
 */
export interface ContractAcceptance {
  acceptedAt: string;
  acceptedBySignature: string | null;
  acceptedIp: string | null;
  acceptedDevice: string | null;
  acceptedVia: string;
}

function viaLabel(via: string): string {
  if (via === "link") return "digitalmente (link público)";
  if (via === "presencial") return "presencialmente";
  if (via === "legado") return "(registro legado)";
  return via;
}

function escapeAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function generateContractHTML(
  patient: PatientBasic,
  plan: { objectives?: string; techniques?: string; frequency?: string; estimatedSessions?: string | number; status?: string; startDate?: string; responsibleProfessional?: string },
  planItems: PlanProcedureItem[],
  clinic?: ClinicInfo | null,
  acceptance?: ContractAcceptance | null,
) {
  const today = format(todayBRTDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  const cpfFmt = patient.cpf ? patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : "—";
  const clinicName = clinic?.name || "FisioGest Pro";
  const clinicCrefito = clinic?.crefito || "";
  const clinicRT = clinic?.responsibleTechnical || "";

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
      ? `${fmtCurrency(unitM)}/mês`
      : isAvulso && sessionCount > 0
        ? `${fmtCurrency(unitP)} × ${sessionCount} sessões`
        : fmtCurrency(unitP);
    const discDetail = disc > 0 ? `<br/><span style="color:#16a34a;font-size:8pt">– Desconto: ${fmtCurrency(disc)}</span>` : "";
    const netDetail = `<strong style="color:#1e40af">${fmtCurrency(net)}${isMensal ? "/mês" : ""}</strong>${discDetail}`;

    return `<tr>
      <td><strong>${label}</strong><br/><span style="font-size:8pt;color:#6b7280">${badge}</span></td>
      <td style="text-align:center">${sessInfo}</td>
      <td style="text-align:center">${weeks}</td>
      <td style="text-align:right;font-size:9pt">${priceDetail}</td>
      <td style="text-align:right">${netDetail}</td>
    </tr>`;
  }).join("");

  const grandTotal = totalSessoesVal + totalMensalVal;

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
          ${totalDisconto > 0 ? `<tr><td colspan="4" style="text-align:right;color:#16a34a;font-weight:600">Total de descontos concedidos:</td><td style="text-align:right;color:#16a34a;font-weight:600">– ${fmtCurrency(totalDisconto)}</td></tr>` : ""}
          ${totalSessoesVal > 0 ? `<tr><td colspan="4" style="text-align:right;font-weight:600">Subtotal (sessões/pacotes):</td><td style="text-align:right;font-weight:600">${fmtCurrency(totalSessoesVal)}</td></tr>` : ""}
          ${totalMensalVal > 0 ? `<tr><td colspan="4" style="text-align:right;font-weight:600">Mensalidade recorrente:</td><td style="text-align:right;font-weight:600">${fmtCurrency(totalMensalVal)}/mês</td></tr>` : ""}
          <tr style="background:#eff6ff"><td colspan="4" style="text-align:right;font-weight:700;color:#1e40af;font-size:10pt">TOTAL ESTIMADO DO PLANO:</td><td style="text-align:right;font-weight:700;color:#1e40af;font-size:11pt">${fmtCurrency(grandTotal)}${totalMensalVal > 0 && totalSessoesVal > 0 ? `<br/><span style="font-size:8pt;font-weight:400">+ ${fmtCurrency(totalMensalVal)}/mês</span>` : ""}</td></tr>
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
        ${renderPatientSignatureBlock(patient.name, cpfFmt, acceptance)}
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">${plan.responsibleProfessional || "Fisioterapeuta / Prestador de Serviço"}</div>
        <div class="sig-label">Contratada</div>
      </div>
    </div>

    <div class="footer">${
      acceptance
        ? `Contrato assinado em ${format(new Date(acceptance.acceptedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} ${viaLabel(acceptance.acceptedVia)} &bull; ${clinicName}`
        : `Contrato gerado em ${today} &bull; ${clinicName} &bull; Valores acordados na contratação do plano`
    }</div>
  `;
}

function renderPatientSignatureBlock(
  patientName: string,
  cpfFmt: string,
  acceptance?: ContractAcceptance | null,
): string {
  if (!acceptance) {
    return `
        <div class="sig-line"></div>
        <div class="sig-label"><strong>${escapeAttr(patientName)}</strong></div>
        <div class="sig-label">CPF: ${cpfFmt}</div>
        <div class="sig-label">Contratante</div>
    `;
  }
  const signed = acceptance.acceptedBySignature?.trim() || patientName;
  const dateFmt = format(new Date(acceptance.acceptedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const via = viaLabel(acceptance.acceptedVia);
  const ip = acceptance.acceptedIp ? `<div>IP: <strong>${escapeAttr(acceptance.acceptedIp)}</strong></div>` : "";
  const device = acceptance.acceptedDevice
    ? `<div style="word-break:break-all">Dispositivo: <span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8pt">${escapeAttr(acceptance.acceptedDevice).slice(0, 240)}</span></div>`
    : "";
  return `
        <div class="sig-signed">
          <div class="sig-signed-name">${escapeAttr(signed)}</div>
          <div class="sig-signed-meta">
            <div><strong>${escapeAttr(patientName)}</strong> &bull; CPF: ${cpfFmt} &bull; Contratante</div>
            <div>Assinado ${via} em <strong>${dateFmt}</strong></div>
            ${ip}
            ${device}
            <div style="margin-top:4px;font-size:8pt;color:#047857">Trilha LGPD imutável (data, IP e dispositivo registrados no momento do aceite).</div>
          </div>
        </div>
    `;
}
