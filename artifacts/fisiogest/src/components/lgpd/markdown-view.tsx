/**
 * Renderizador de Markdown leve, sem dependência externa.
 * Cobre apenas o subconjunto usado nas políticas (FisioGest):
 *  - cabeçalhos `# … ######`
 *  - listas `-` (uma profundidade)
 *  - tabelas GFM (cabeçalho `|` + separador `---`)
 *  - parágrafos
 *  - **negrito** e *itálico*
 *  - código inline `code`
 */
import React from "react";

function inline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  // ordem importa: code > bold > italic
  const patterns: Array<{
    re: RegExp;
    render: (m: RegExpExecArray, k: number) => React.ReactNode;
  }> = [
    {
      re: /`([^`]+)`/,
      render: (m, k) => (
        <code key={k} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
          {m[1]}
        </code>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m, k) => <strong key={k}>{m[1]}</strong>,
    },
    {
      re: /\*([^*]+)\*/,
      render: (m, k) => <em key={k}>{m[1]}</em>,
    },
  ];

  while (rest.length > 0) {
    let earliest: { idx: number; m: RegExpExecArray; pat: (typeof patterns)[number] } | null = null;
    for (const pat of patterns) {
      const m = pat.re.exec(rest);
      if (m && (earliest === null || m.index < earliest.idx)) {
        earliest = { idx: m.index, m, pat };
      }
    }
    if (!earliest) {
      out.push(rest);
      break;
    }
    if (earliest.idx > 0) out.push(rest.slice(0, earliest.idx));
    out.push(earliest.pat.render(earliest.m, key++));
    rest = rest.slice(earliest.idx + earliest.m[0].length);
  }
  return out;
}

interface Block {
  type: "h" | "p" | "ul" | "table";
  level?: number;
  text?: string;
  items?: string[];
  rows?: string[][];
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "h", level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("- ")) {
        items.push(lines[i]!.slice(2));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (line.startsWith("|") && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1]!.trim())) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.startsWith("|")) {
        const raw = lines[i]!.trim();
        if (/^\|[\s:|-]+\|$/.test(raw)) {
          i++;
          continue;
        }
        const cells = raw
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
        rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    // parágrafo: agrega linhas consecutivas
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.startsWith("#") &&
      !lines[i]!.startsWith("- ") &&
      !lines[i]!.startsWith("|")
    ) {
      buf.push(lines[i]!);
      i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

const headingClass = (lvl: number) => {
  switch (lvl) {
    case 1:
      return "text-3xl font-display font-bold text-foreground mt-8 mb-4";
    case 2:
      return "text-2xl font-display font-semibold text-foreground mt-8 mb-3";
    case 3:
      return "text-xl font-display font-semibold text-foreground mt-6 mb-2";
    default:
      return "text-lg font-semibold text-foreground mt-4 mb-2";
  }
};

export function MarkdownView({ source }: { source: string }) {
  const blocks = parse(source);
  return (
    <div className="text-slate-700 leading-relaxed text-[0.95rem]">
      {blocks.map((b, idx) => {
        if (b.type === "h") {
          const lvl = b.level ?? 2;
          const cls = headingClass(lvl);
          const children = inline(b.text!);
          if (lvl === 1) return <h1 key={idx} className={cls}>{children}</h1>;
          if (lvl === 2) return <h2 key={idx} className={cls}>{children}</h2>;
          if (lvl === 3) return <h3 key={idx} className={cls}>{children}</h3>;
          if (lvl === 4) return <h4 key={idx} className={cls}>{children}</h4>;
          if (lvl === 5) return <h5 key={idx} className={cls}>{children}</h5>;
          return <h6 key={idx} className={cls}>{children}</h6>;
        }
        if (b.type === "p") {
          return (
            <p key={idx} className="mb-3">
              {inline(b.text!)}
            </p>
          );
        }
        if (b.type === "ul") {
          return (
            <ul key={idx} className="mb-3 list-disc pl-6 space-y-1">
              {b.items!.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.type === "table") {
          const [header, ...rest] = b.rows!;
          return (
            <div key={idx} className="my-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {header!.map((c, j) => (
                      <th key={j} className="px-3 py-2 text-left font-semibold text-slate-700">
                        {inline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rest.map((row, ri) => (
                    <tr key={ri} className="border-t border-slate-200">
                      {row.map((c, j) => (
                        <td key={j} className="px-3 py-2 align-top">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
