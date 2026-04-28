/**
 * Re-export barrel — mantido por compatibilidade com imports existentes.
 *
 * O conteúdo foi quebrado em módulos co-localizados em `./print/` para
 * reduzir tamanho de arquivo (era 961 linhas) e isolar os geradores HTML
 * por documento. Novos imports devem preferir os caminhos diretos.
 */
export { fetchClinicForPrint, buildClinicHeaderHTML, printDocument, extractCityState, CONTRACT_PRINT_CSS } from "./print/_shared";
export { generateDischargeHTML } from "./print/discharge";
export { generateEvolutionsHTML } from "./print/evolutions";
export { generatePlanHTML } from "./print/plan";
export { generateContractHTML } from "./print/contract";
export { generateFullProntuarioHTML } from "./print/full-prontuario";
export { ExportProntuarioButton } from "./print/export-button";
