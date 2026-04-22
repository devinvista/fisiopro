import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/utils/use-auth";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/HeroSection";
import { StatsSection } from "@/components/landing/StatsSection";
import { ProblemsSection } from "@/components/landing/ProblemsSection";
import { SolutionSection } from "@/components/landing/SolutionSection";

const FeaturesSection = lazy(() =>
  import("@/components/landing/FeaturesSection").then((m) => ({ default: m.FeaturesSection }))
);
const BenefitsSection = lazy(() =>
  import("@/components/landing/BenefitsSection").then((m) => ({ default: m.BenefitsSection }))
);
const PricingSection = lazy(() =>
  import("@/components/landing/PricingSection").then((m) => ({ default: m.PricingSection }))
);
const TestimonialsSection = lazy(() =>
  import("@/components/landing/TestimonialsSection").then((m) => ({ default: m.TestimonialsSection }))
);
const FAQSection = lazy(() =>
  import("@/components/landing/FAQSection").then((m) => ({ default: m.FAQSection }))
);
const CTASection = lazy(() =>
  import("@/components/landing/CTASection").then((m) => ({ default: m.CTASection }))
);
const LandingFooter = lazy(() =>
  import("@/components/landing/LandingFooter").then((m) => ({ default: m.LandingFooter }))
);

function BelowFoldFallback() {
  return (
    <div className="py-24 flex items-center justify-center" aria-hidden="true">
      <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
    </div>
  );
}

export default function LandingPage() {
  const { token } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    document.title = "FisioGest Pro — Sistema Completo para Gestão de Clínicas";
  }, []);

  useEffect(() => {
    if (token) {
      setLocation("/dashboard");
    }
  }, [token, setLocation]);

  const scrollTo = (href: string) => {
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden">
      <LandingHeader />

      <main id="main-content">
        {/* Above-the-fold — eager loaded, zero latency */}
        <HeroSection onScrollTo={scrollTo} />
        <StatsSection />

        {/* Near-fold — eager loaded to avoid spinner flash */}
        <ProblemsSection />
        <SolutionSection />

        {/* Below-fold — single Suspense boundary, one spinner max */}
        <Suspense fallback={<BelowFoldFallback />}>
          <FeaturesSection />
          <BenefitsSection />
          <PricingSection />
          <TestimonialsSection />
          <FAQSection />
          <CTASection />
        </Suspense>
      </main>

      <Suspense fallback={null}>
        <LandingFooter />
      </Suspense>
    </div>
  );
}
