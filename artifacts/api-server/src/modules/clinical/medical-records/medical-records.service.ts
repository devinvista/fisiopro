// ─── Medical Records Service ───────────────────────────────────────────────────
// Complex multi-source data aggregation logic

type AnamnesisRow = {
  templateType: string;
  painScale: number | null;
  updatedAt: Date;
  bodyWeight: string | null;
  bodyHeight: string | null;
  bodyMeasurements: string | null;
  celluliteGrade: string | null;
  cid10: string | null;
  painLocation: string | null;
  functionalImpact: string | null;
};

type EvaluationRow = { painScale: number | null; createdAt: Date };
type EvolutionRow = { painScale: number | null; createdAt: Date };

type BodyMeasurementRow = {
  id: number;
  measuredAt: Date;
  weight: string | null;
  height: string | null;
  waist: string | null;
  abdomen: string | null;
  hips: string | null;
  thighRight: string | null;
  thighLeft: string | null;
  armRight: string | null;
  armLeft: string | null;
  calfRight: string | null;
  calfLeft: string | null;
  bodyFat: string | null;
  celluliteGrade: string | null;
  notes: string | null;
};

const TEMPLATE_LABELS: Record<string, string> = {
  reabilitacao: "Reabilitação",
  esteticaFacial: "Estética Facial",
  esteticaCorporal: "Estética Corporal",
};

export function buildIndicators(
  allAnamnesis: AnamnesisRow[],
  evaluations: EvaluationRow[],
  evolutions: EvolutionRow[],
  bodyMeasurements: BodyMeasurementRow[],
) {
  // Build EVA history from all sources sorted by date
  const evaPoints: { date: string; value: number; source: string; label: string }[] = [];

  for (const a of allAnamnesis) {
    if (a.painScale != null) {
      evaPoints.push({
        date: a.updatedAt.toISOString(),
        value: a.painScale,
        source: "anamnesis",
        label: `Anamnese (${TEMPLATE_LABELS[a.templateType] ?? a.templateType})`,
      });
    }
  }

  for (const ev of evaluations) {
    if (ev.painScale != null) {
      evaPoints.push({
        date: ev.createdAt.toISOString(),
        value: ev.painScale,
        source: "evaluation",
        label: "Avaliação Física",
      });
    }
  }

  for (const evo of evolutions) {
    if (evo.painScale != null) {
      evaPoints.push({
        date: evo.createdAt.toISOString(),
        value: evo.painScale,
        source: "evolution",
        label: "Sessão",
      });
    }
  }

  evaPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Body indicators from corporal anamnesis (current values)
  const corporalAnamnesis = allAnamnesis.find(a => a.templateType === "esteticaCorporal");
  const bodyIndicators = corporalAnamnesis
    ? {
        weight: corporalAnamnesis.bodyWeight,
        height: corporalAnamnesis.bodyHeight,
        measurements: corporalAnamnesis.bodyMeasurements,
        celluliteGrade: corporalAnamnesis.celluliteGrade,
        updatedAt: corporalAnamnesis.updatedAt.toISOString(),
      }
    : null;

  // Reab indicators from reabilitacao anamnesis
  const reabAnamnesis = allAnamnesis.find(a => a.templateType === "reabilitacao");
  const reabIndicators = reabAnamnesis
    ? {
        cid10: reabAnamnesis.cid10,
        painLocation: reabAnamnesis.painLocation,
        functionalImpact: reabAnamnesis.functionalImpact,
        updatedAt: reabAnamnesis.updatedAt.toISOString(),
      }
    : null;

  // Body measurements time series
  const bodyMeasurementsSeries = bodyMeasurements.map(m => ({
    id: m.id,
    date: m.measuredAt.toISOString(),
    weight: m.weight ? parseFloat(m.weight) : null,
    height: m.height ? parseFloat(m.height) : null,
    waist: m.waist ? parseFloat(m.waist) : null,
    abdomen: m.abdomen ? parseFloat(m.abdomen) : null,
    hips: m.hips ? parseFloat(m.hips) : null,
    thighRight: m.thighRight ? parseFloat(m.thighRight) : null,
    thighLeft: m.thighLeft ? parseFloat(m.thighLeft) : null,
    armRight: m.armRight ? parseFloat(m.armRight) : null,
    armLeft: m.armLeft ? parseFloat(m.armLeft) : null,
    calfRight: m.calfRight ? parseFloat(m.calfRight) : null,
    calfLeft: m.calfLeft ? parseFloat(m.calfLeft) : null,
    bodyFat: m.bodyFat ? parseFloat(m.bodyFat) : null,
    celluliteGrade: m.celluliteGrade,
    notes: m.notes,
  }));

  return {
    eva: evaPoints,
    body: bodyIndicators,
    reab: reabIndicators,
    bodyMeasurements: bodyMeasurementsSeries,
  };
}
