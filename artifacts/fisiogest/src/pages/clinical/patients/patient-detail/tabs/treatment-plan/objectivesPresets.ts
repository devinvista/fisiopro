export type ObjectiveCategory =
  | "reabilitacao"
  | "esteticaFacial"
  | "esteticaCorporal"
  | "pilates"
  | "geral";

export const OBJECTIVE_PRESETS: Record<ObjectiveCategory, string[]> = {
  reabilitacao: [
    "Reduzir quadro álgico",
    "Recuperar amplitude de movimento",
    "Fortalecer musculatura estabilizadora",
    "Melhorar funcionalidade nas AVDs",
    "Reeducação postural",
    "Reabilitação pós-cirúrgica",
    "Tratamento conservador da lesão",
    "Prevenir recidivas",
    "Restabelecer marcha funcional",
    "Reabilitação neurológica",
  ],
  esteticaFacial: [
    "Uniformizar tônus da pele",
    "Reduzir linhas de expressão",
    "Melhorar viço e luminosidade",
    "Tratar hiperpigmentação",
    "Estimular produção de colágeno",
    "Reduzir oleosidade e poros",
    "Tratamento anti-acne",
    "Hidratação profunda da pele",
    "Lifting facial não invasivo",
    "Cuidado pós-procedimento estético",
  ],
  esteticaCorporal: [
    "Redução de medidas",
    "Tratamento de gordura localizada",
    "Combate à celulite",
    "Tonificação muscular",
    "Drenagem linfática",
    "Combate à flacidez tissular",
    "Modelagem corporal",
    "Cuidado pós-parto",
    "Pré e pós-operatório de cirurgia plástica",
    "Bem-estar e relaxamento",
  ],
  pilates: [
    "Fortalecimento do core",
    "Melhora da consciência corporal",
    "Reeducação postural",
    "Aumento de flexibilidade",
    "Equilíbrio e propriocepção",
    "Pilates para gestantes",
    "Pilates terapêutico para dor crônica",
    "Condicionamento físico geral",
    "Mobilidade da coluna",
    "Reabilitação ortopédica via pilates",
  ],
  geral: [
    "Melhora da qualidade de vida",
    "Redução de sintomas",
    "Educação em saúde",
    "Prevenção de complicações",
    "Manutenção de ganhos terapêuticos",
  ],
};

export function categoryFromTemplate(
  template: string | undefined | null,
): ObjectiveCategory {
  switch (template) {
    case "reabilitacao":
      return "reabilitacao";
    case "esteticaFacial":
      return "esteticaFacial";
    case "esteticaCorporal":
      return "esteticaCorporal";
    case "pilates":
      return "pilates";
    default:
      return "geral";
  }
}

export function categoryLabel(c: ObjectiveCategory): string {
  return {
    reabilitacao: "Reabilitação",
    esteticaFacial: "Estética Facial",
    esteticaCorporal: "Estética Corporal",
    pilates: "Pilates",
    geral: "Gerais",
  }[c];
}
