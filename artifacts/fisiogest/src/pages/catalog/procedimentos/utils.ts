import { Procedure } from "./types";

export function getCatalogHtml(
  clinicName: string,
  tagline: string,
  introText: string,
  showPrices: boolean,
  sectionsHtml: string,
  activeCount: number,
  today: string
) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Catálogo de Serviços — ${clinicName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', sans-serif;
      background: #f8fafc;
      color: #1e293b;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
      min-height: 100vh;
    }

    /* ── Hero header ── */
    .hero {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
      padding: 52px 48px 44px;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: "";
      position: absolute;
      top: -60px; right: -60px;
      width: 240px; height: 240px;
      border-radius: 50%;
      background: rgba(255,255,255,0.04);
    }
    .hero::after {
      content: "";
      position: absolute;
      bottom: -80px; left: 40%;
      width: 300px; height: 300px;
      border-radius: 50%;
      background: rgba(255,255,255,0.03);
    }
    .hero-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 12px;
    }
    .hero-name {
      font-family: 'Outfit', sans-serif;
      font-size: 40px;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #fff 60%, #7dd3fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero-tagline {
      font-size: 15px;
      color: #94a3b8;
      font-weight: 400;
      margin-bottom: 28px;
    }
    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.12);
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 500;
      padding: 6px 14px;
      border-radius: 100px;
    }

    /* ── Content ── */
    .content { padding: 40px 48px 56px; }

    .intro {
      font-size: 14px;
      color: #64748b;
      line-height: 1.7;
      margin-bottom: 36px;
      padding-bottom: 28px;
      border-bottom: 1px solid #e2e8f0;
    }

    /* ── Category sections ── */
    .category-section { margin-bottom: 36px; }

    .category-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 14px;
    }
    .category-title {
      font-family: 'Outfit', sans-serif;
      font-size: 17px;
      font-weight: 700;
    }
    .category-count {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
    }

    /* ── Procedure cards ── */
    .proc-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .proc-card {
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 14px 16px;
      background: #fff;
    }
    .proc-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .proc-name {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      flex: 1;
      line-height: 1.4;
    }
    .proc-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
      shrink: 0;
    }
    .proc-duration {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
    }
    .proc-price {
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .proc-desc {
      font-size: 11.5px;
      color: #64748b;
      line-height: 1.55;
    }

    /* ── Footer ── */
    .footer {
      padding: 20px 48px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f8fafc;
    }
    .footer-brand {
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: #334155;
    }
    .footer-date {
      font-size: 11px;
      color: #94a3b8;
    }

    /* ── No-price note ── */
    .no-price-note {
      font-size: 12px;
      color: #94a3b8;
      font-style: italic;
      margin-bottom: 28px;
    }

    /* ── Print ── */
    .print-btn {
      position: fixed;
      bottom: 24px; right: 24px;
      background: #0f172a;
      color: #fff;
      border: none;
      border-radius: 100px;
      padding: 12px 24px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 4px 24px rgba(0,0,0,0.25);
      display: flex; align-items: center; gap: 8px;
    }
    .print-btn:hover { background: #1e293b; }

    @media print {
      @page { size: A4; margin: 1.5cm; }
      body { background: #fff; }
      .print-btn { display: none !important; }
      .page { box-shadow: none; max-width: none; margin: 0; }
      .proc-card { break-inside: avoid; }
      .category-section { break-inside: avoid; }
      .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="hero">
      <div class="hero-eyebrow">Portfólio de Serviços</div>
      <div class="hero-name">${clinicName}</div>
      <div class="hero-tagline">${tagline}</div>
      <div class="hero-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
        ${activeCount} serviços disponíveis
      </div>
    </div>

    <div class="content">
      <div class="intro">
        ${introText}
      </div>

      ${!showPrices ? `<div class="no-price-note">* Entre em contato para informações sobre valores e pacotes personalizados.</div>` : ""}

      ${sectionsHtml}
    </div>

    <div class="footer">
      <div class="footer-brand">${clinicName}</div>
      <div class="footer-date">Gerado em ${today}</div>
    </div>
  </div>

  <button class="print-btn" onclick="window.print()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Imprimir / Salvar PDF
  </button>
</body>
</html>`;
}
