import { useState } from "react";
import { FadeIn } from "./utils";
import { ChevronDown, HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FAQS = [
  {
    question: "O sistema funciona no celular?",
    answer:
      "Sim! FisioGest Pro é totalmente responsivo e funciona perfeitamente em smartphones, tablets e computadores. Você pode acessar de qualquer dispositivo, em qualquer lugar, a qualquer hora — sem precisar instalar nada.",
  },
  {
    question: "Preciso instalar algum software?",
    answer:
      "Não. FisioGest Pro funciona 100% no navegador web, como Chrome, Safari ou Firefox. Não há nada para baixar ou instalar. Basta criar sua conta e começar a usar imediatamente.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Absolutamente. Não há contratos de fidelidade ou multa por cancelamento. Você pode cancelar sua assinatura a qualquer momento, e seus dados ficam disponíveis para exportação por 30 dias após o cancelamento.",
  },
  {
    question: "Meus dados estão seguros?",
    answer:
      "A segurança é nossa prioridade. Todos os dados são criptografados em trânsito e em repouso, armazenados em servidores com redundância geográfica e backup automático diário. Estamos em conformidade com a LGPD (Lei Geral de Proteção de Dados).",
  },
  {
    question: "Como funciona o suporte?",
    answer:
      "Oferecemos suporte por chat e e-mail em todos os planos. O plano Professional inclui suporte prioritário com tempo de resposta reduzido. O plano Enterprise conta com um gerente de conta dedicado e suporte via WhatsApp.",
  },
  {
    question: "Posso importar meus dados existentes?",
    answer:
      "Sim! Nossa equipe ajuda na migração de dados de planilhas e outros sistemas. Entre em contato após criar sua conta e iremos orientar todo o processo de importação sem custo adicional.",
  },
];

function FAQItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [open, setOpen] = useState(false);
  const id = `faq-${index}`;

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <span className="font-semibold text-slate-900 text-base">{question}</span>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            role="region"
            aria-label={question}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 text-slate-500 text-sm leading-relaxed border-t border-slate-100 pt-4">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="py-24 lg:py-32 bg-slate-50"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <FadeIn className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-100 text-teal-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5">
            <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
            Dúvidas frequentes
          </div>
          <h2
            id="faq-heading"
            className="font-display font-bold text-slate-900 text-4xl lg:text-5xl mb-4"
          >
            Perguntas
            <br className="hidden sm:block" /> frequentes
          </h2>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            Não encontrou o que procurava? Entre em contato pelo chat ou{" "}
            <a
              href="mailto:contato@fisiogestpro.com.br"
              className="text-teal-600 font-medium hover:underline"
              aria-label="Enviar e-mail para suporte"
            >
              e-mail
            </a>
            .
          </p>
        </FadeIn>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <FadeIn key={i} delay={i * 0.06}>
              <FAQItem question={faq.question} answer={faq.answer} index={i} />
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
