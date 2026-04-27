export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function maskPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCnpj(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function displayCpf(value: string | null | undefined): string {
  if (!value) return "";
  return maskCpf(value);
}

export function displayPhone(value: string | null | undefined): string {
  if (!value) return "";
  return maskPhone(value);
}

export function displayCnpj(value: string | null | undefined): string {
  if (!value) return "";
  return maskCnpj(value);
}

const NAME_LOWERCASE_PARTICLES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "di",
  "du",
  "del",
  "della",
  "von",
  "van",
  "der",
  "la",
  "le",
  "y",
]);

function capitalizeWord(word: string): string {
  if (!word) return word;
  if (word.includes("-")) {
    return word
      .split("-")
      .map((part) => capitalizeWord(part))
      .join("-");
  }
  if (word.includes("'")) {
    return word
      .split("'")
      .map((part, idx) => (idx === 0 ? capitalizeWord(part) : capitalizeWord(part)))
      .join("'");
  }
  const first = word.charAt(0).toLocaleUpperCase("pt-BR");
  const rest = word.slice(1).toLocaleLowerCase("pt-BR");
  return first + rest;
}

/**
 * Converte um nome para Title Case respeitando partículas comuns
 * (de, da, do, das, dos, e, di, du, del, von, van, der, la, le, y).
 * Partículas no meio do nome ficam minúsculas; a primeira palavra
 * sempre é capitalizada, mesmo que seja partícula.
 */
export function toTitleCaseName(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((token, idx) => {
      if (!token) return token;
      const lower = token.toLocaleLowerCase("pt-BR");
      if (idx > 0 && NAME_LOWERCASE_PARTICLES.has(lower)) {
        return lower;
      }
      return capitalizeWord(lower);
    })
    .join(" ");
}

/**
 * Máscara para campo de nome de pessoa: aceita apenas letras
 * (com acento), espaços, hífen e apóstrofo; remove dígitos e
 * pontuação; aplica Title Case automaticamente.
 *
 * Preserva espaço final (enquanto o usuário digita) para não
 * "engolir" o separador entre palavras durante a digitação.
 */
export function maskName(value: string): string {
  const cleaned = value
    .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'-]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "");
  const hadTrailingSpace = /\s$/.test(cleaned);
  const titled = toTitleCaseName(cleaned);
  if (!titled) return "";
  return hadTrailingSpace ? `${titled} ` : titled;
}

export function displayName(value: string | null | undefined): string {
  if (!value) return "";
  return toTitleCaseName(value);
}
