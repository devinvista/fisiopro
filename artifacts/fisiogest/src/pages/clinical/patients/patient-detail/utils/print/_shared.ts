import type { ClinicInfo } from "../../types";
import { apiFetchJson } from "@/lib/api";

export function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtCurrency(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}

export async function fetchClinicForPrint(): Promise<ClinicInfo | null> {
  try {
    return await apiFetchJson<ClinicInfo>("/api/clinics/current");
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

/**
 * CSS compartilhado entre a versão impressa do contrato (`printDocument`) e
 * a renderização in-page (página pública `/aceite/:token`). Mantido como
 * constante para evitar drift visual entre os dois contextos.
 */
export const CONTRACT_PRINT_CSS = `
    .doc-root{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#111;background:#fff}
    .doc-root *{box-sizing:border-box}
    .doc-root h1{font-size:15pt;font-weight:bold;text-align:center;margin-bottom:4px}
    .doc-root .header{text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:18px}
    .doc-root .subtitle{font-size:10pt;color:#333;text-align:center;margin-bottom:4px}
    .doc-root .patient-box{border:1px solid #999;border-radius:4px;padding:10px 14px;margin-bottom:16px;background:#fafafa}
    .doc-root .row{display:flex;gap:24px;flex-wrap:wrap;margin-top:4px}
    .doc-root .field{flex:1;min-width:140px}
    .doc-root .label{font-size:8.5pt;text-transform:uppercase;color:#555;font-weight:bold;margin-bottom:1px}
    .doc-root .value{font-size:10.5pt}
    .doc-root .section{margin-bottom:14px}
    .doc-root .section-title{font-size:10pt;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;color:#333;border-bottom:1px solid #ccc;padding-bottom:3px;margin-bottom:8px}
    .doc-root .content-box{background:#f5f5f5;border-radius:3px;padding:8px 12px;line-height:1.6;white-space:pre-wrap;font-size:10.5pt}
    .doc-root .evo-card{border:1px solid #ddd;border-radius:4px;padding:10px 12px;margin-bottom:10px;page-break-inside:avoid}
    .doc-root .evo-num{display:inline-flex;align-items:center;justify-content:center;background:#1d4ed8;color:#fff;border-radius:50%;width:22px;height:22px;font-size:9pt;font-weight:bold;margin-right:8px;flex-shrink:0}
    .doc-root .evo-date{font-size:9pt;color:#666}
    .doc-root .evo-field{margin-top:6px}
    .doc-root .fl{font-size:8.5pt;font-weight:bold;color:#555;margin-bottom:1px}
    .doc-root .fv{font-size:10pt;line-height:1.5}
    .doc-root .progress-bar{background:#e5e7eb;height:10px;border-radius:5px;margin:6px 0}
    .doc-root .progress-fill{background:#1d4ed8;height:10px;border-radius:5px}
    .doc-root .sessions-table{width:100%;border-collapse:collapse;margin-top:8px}
    .doc-root .sessions-table th{background:#1d4ed8;color:#fff;font-size:9pt;padding:5px 8px;text-align:left}
    .doc-root .sessions-table td{border:1px solid #e5e7eb;font-size:10pt;padding:5px 8px}
    .doc-root .sessions-table tr:nth-child(even) td{background:#f9fafb}
    .doc-root .signature{margin-top:40px;text-align:center}
    .doc-root .sig-line{border-top:1px solid #000;display:inline-block;width:220px;margin-bottom:4px}
    .doc-root .sig-label{font-size:9.5pt;color:#444}
    .doc-root .sig-signed{border:1px solid #10b981;background:#ecfdf5;border-radius:6px;padding:10px 12px;text-align:left}
    .doc-root .sig-signed-name{font-family:'Brush Script MT','Lucida Handwriting',cursive;font-size:18pt;color:#065f46;line-height:1.2;margin-bottom:6px}
    .doc-root .sig-signed-meta{font-size:8.5pt;color:#065f46;line-height:1.5}
    .doc-root .sig-signed-meta strong{color:#064e3b}
    .doc-root .footer{margin-top:28px;border-top:1px solid #ccc;padding-top:8px;font-size:8pt;color:#888;text-align:center}
    .doc-root p{margin-bottom:6px;line-height:1.5}
`;

export function printDocument(html: string, title: string) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Permita pop-ups para gerar o documento."); return; }
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
  <meta charset="UTF-8"><title>${title}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{padding:2cm 2.5cm}
    ${CONTRACT_PRINT_CSS}
    .doc-root{padding:0}
    @media print{@page{size:A4;margin:1.5cm}body{padding:0}}
  </style></head>
  <body><div class="doc-root">${html}</div><script>window.onload=function(){setTimeout(function(){window.print();},400);}</script></body></html>`);
  w.document.close();
}

export function extractCityState(address: string | null | undefined): string {
  if (!address) return "_______________";
  const withoutCep = address.replace(/,?\s*\d{5}-?\d{3}\s*$/, "").trim();
  const parts = withoutCep.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return address;
  return parts[parts.length - 1];
}
