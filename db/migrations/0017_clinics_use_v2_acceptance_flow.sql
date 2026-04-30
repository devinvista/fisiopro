-- Sprint 15 (F3) — Feature flag para o novo fluxo de aceite (v2).
--
-- O fluxo v2 (Itens → Cobrança → Agenda → Contrato + aceite atômico) coexiste
-- com o fluxo legado (Itens → Aceite → Cobrança → Iniciar) durante o rollout.
-- Cada clínica pode optar individualmente. Default `false` (mantém comporta-
-- mento atual) para evitar surpresas em clínicas em produção.
--
-- O backend já entrega `POST /accept-and-materialize` (F1+F2). Esta flag só
-- controla qual UI o frontend renderiza no `TreatmentPlanTab`.
--
-- Domínio: boolean. Trocar para `true` ativa o novo wizard imediatamente para
-- planos novos. Planos já vigentes continuam usando o que foi capturado no
-- aceite original (snapshot é imutável).
--
-- Idempotente — seguro para re-execução.

ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS use_v2_acceptance_flow BOOLEAN NOT NULL DEFAULT FALSE;
