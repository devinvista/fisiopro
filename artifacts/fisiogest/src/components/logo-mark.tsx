import * as React from "react";

export type LogoMarkProps = {
  className?: string;
  size?: number | string;
  /**
   * Cor do mark. Por padrão segue `currentColor` (controlada via Tailwind/CSS).
   * Use "primary" para preencher com a cor primária do tema.
   */
  tone?: "current" | "primary" | "white" | "dark";
  /** Cor do traço interno (cruz + círculo). Default branco. */
  stroke?: string;
};

/**
 * Mark oficial "Cruz Clínica" — definido no brand book v1.
 * Cruz médica + círculo sutil de movimento, dentro de um quadrado arredondado.
 *
 * Mantém a API original (`className`) e adiciona `size` / `tone` / `stroke`
 * para uso no header do sidebar e em contextos com fundos diferentes.
 */
export default function LogoMark({
  className,
  size,
  tone = "current",
  stroke = "white",
}: LogoMarkProps) {
  const fillClass =
    tone === "primary"
      ? "fill-primary"
      : tone === "white"
        ? "fill-white"
        : tone === "dark"
          ? "fill-sidebar"
          : "fill-current";

  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="FisioGest Pro"
    >
      <rect width="36" height="36" rx="10" className={fillClass} />
      <path
        d="M18 8v20M8 18h20"
        stroke={stroke}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle
        cx="18"
        cy="18"
        r="6"
        stroke={stroke}
        strokeWidth="2"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

/**
 * Wordmark "FisioGest Pro" no estilo do brand book.
 * Inter/Outfit · destaque em "Gest" na cor primária · "Pro" em caixa alta.
 */
export function LogoWordmark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span
      className={`font-display font-extrabold tracking-tight inline-flex items-baseline ${
        inverted ? "text-white" : "text-foreground"
      } ${className ?? ""}`}
    >
      Fisio
      <span className={inverted ? "text-primary-foreground" : "text-primary"}>
        Gest
      </span>
      <span
        className={`ml-1.5 text-[0.55em] font-bold tracking-[0.2em] uppercase translate-y-[-2px] ${
          inverted ? "text-white/65" : "text-foreground/55"
        }`}
      >
        Pro
      </span>
    </span>
  );
}

/** Lockup horizontal completo (mark + wordmark). */
export function LogoLockup({
  className,
  inverted = false,
  markSize = 36,
}: {
  className?: string;
  inverted?: boolean;
  markSize?: number;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <LogoMark
        size={markSize}
        tone={inverted ? "primary" : "primary"}
        stroke="white"
      />
      <LogoWordmark inverted={inverted} className="text-xl" />
    </span>
  );
}
