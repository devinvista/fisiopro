import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Stethoscope, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MarkdownView } from "@/components/lgpd/markdown-view";
import {
  getCurrentPolicyByType,
  type PolicyDocument,
  type PolicyType,
} from "@/lib/lgpd";

interface PolicyPageProps {
  type: PolicyType;
  fallbackTitle: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return iso;
  }
}

export function PolicyPage({ type, fallbackTitle }: PolicyPageProps) {
  const [doc, setDoc] = useState<PolicyDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCurrentPolicyByType(type)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="rounded-lg bg-primary p-2">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-lg font-bold">FisioGest Pro</span>
          </Link>
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <div className="mt-6 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-9/12" />
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h1 className="text-xl font-semibold text-red-900">{fallbackTitle}</h1>
              <p className="mt-2 text-sm text-red-700">
                Não foi possível carregar este documento agora.{" "}
                <span className="font-mono text-xs">{error}</span>
              </p>
            </div>
          ) : doc ? (
            <>
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {doc.type === "privacy" ? "LGPD · Lei 13.709/2018" : "Termos de Uso"}
                  </p>
                  <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
                    {doc.title}
                  </h1>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>
                    Versão <span className="font-semibold text-slate-700">{doc.version}</span>
                  </div>
                  <div>Vigente desde {formatDate(doc.publishedAt)}</div>
                </div>
              </div>
              <MarkdownView source={doc.contentMd} />
            </>
          ) : null}
        </article>

        <div className="mt-6 text-center text-xs text-slate-500">
          Para exercer seus direitos como titular, contate{" "}
          <a
            href="mailto:dpo@fisiogest.com.br"
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            dpo@fisiogest.com.br
          </a>
          .
        </div>
      </main>
    </div>
  );
}

export function PrivacyPolicyPage() {
  return <PolicyPage type="privacy" fallbackTitle="Política de Privacidade" />;
}

export function TermsOfUsePage() {
  return <PolicyPage type="terms" fallbackTitle="Termos de Uso" />;
}
