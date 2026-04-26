import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import pg from "pg";
import * as schema from "../lib/db/src/schema/index.js";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const POLICIES = [
  {
    type: "privacy" as const,
    version: "1.0.0",
    title: "Política de Privacidade — FisioGest Pro",
    summary:
      "Resumo dos dados coletados, finalidades, bases legais (LGPD), compartilhamento, retenção e direitos do titular.",
    contentMd: `# Política de Privacidade — FisioGest Pro

**Versão 1.0.0 — vigente a partir de abril de 2026**

A FisioGest Pro ("nós") respeita a sua privacidade e está comprometida em proteger
os dados pessoais e dados sensíveis de saúde tratados em nossa plataforma de
gestão clínica, em conformidade com a **Lei Geral de Proteção de Dados — Lei nº
13.709/2018 (LGPD)**.

## 1. Dados que tratamos

- **Dados cadastrais**: nome, CPF, RG, data de nascimento, endereço, telefone,
  e-mail e foto de perfil.
- **Dados de saúde** (sensíveis, art. 5º, II, LGPD): anamnese, evoluções
  clínicas, avaliações, planos de tratamento, atestados, exames, medidas
  corporais e fotografias evolutivas.
- **Dados financeiros**: pagamentos, pacotes contratados, créditos de sessão,
  carteira do paciente e movimentações.
- **Dados de uso**: registros de acesso (logs), endereço IP, navegador e
  trilha de auditoria das ações realizadas no sistema.

## 2. Finalidades e bases legais

| Finalidade | Base legal (LGPD) |
| --- | --- |
| Prestação dos serviços de fisioterapia e gestão clínica | Execução de contrato (art. 7º, V) |
| Tratamento de dados de saúde | Tutela da saúde (art. 11, II, "f") |
| Cumprimento de obrigações legais e regulatórias | Obrigação legal (art. 7º, II) |
| Cobrança e gestão financeira | Execução de contrato (art. 7º, V) |
| Marketing e comunicações opcionais | Consentimento (art. 7º, I) |

## 3. Compartilhamento

Seus dados podem ser compartilhados com: profissionais da clínica responsáveis
pelo seu atendimento, gateways de pagamento, provedores de infraestrutura em
nuvem e autoridades públicas quando exigido por lei.

## 4. Retenção

Mantemos seus dados pelo período necessário ao cumprimento das finalidades
acima e pelos prazos legais aplicáveis (mínimo de 20 anos para prontuário
clínico, conforme Resolução COFFITO 414/2012).

## 5. Direitos do titular (art. 18, LGPD)

Você pode, a qualquer momento, solicitar:

- Confirmação da existência de tratamento;
- Acesso aos seus dados;
- Correção de dados incompletos ou inexatos;
- **Portabilidade** dos seus dados em formato estruturado (JSON);
- Eliminação dos dados tratados com seu consentimento;
- Informação sobre compartilhamentos;
- Revogação do consentimento.

## 6. Encarregado de Dados (DPO)

Para exercer seus direitos ou esclarecer dúvidas, contate nosso encarregado em
**dpo@fisiogest.com.br**.

## 7. Segurança

Adotamos medidas técnicas e organizacionais para proteger seus dados,
incluindo criptografia em trânsito (TLS), controle de acesso por função,
trilha de auditoria e backups periódicos.

## 8. Alterações desta política

Podemos atualizar esta política periodicamente. Quando isso ocorrer,
solicitaremos novamente o seu aceite no próximo acesso.
`,
  },
  {
    type: "terms" as const,
    version: "1.0.0",
    title: "Termos de Uso — FisioGest Pro",
    summary:
      "Regras de uso da plataforma, responsabilidades do usuário e da contratante, limites de uso e prestação dos serviços.",
    contentMd: `# Termos de Uso — FisioGest Pro

**Versão 1.0.0 — vigente a partir de abril de 2026**

## 1. Aceitação

Ao se cadastrar e utilizar a plataforma FisioGest Pro, você ("Usuário")
concorda com estes Termos de Uso e com a nossa Política de Privacidade.

## 2. Cadastro e responsabilidades

- O Usuário é responsável pela veracidade das informações fornecidas no
  cadastro.
- As credenciais de acesso são pessoais e intransferíveis.
- O Usuário deve manter o sigilo da senha e notificar imediatamente qualquer
  uso não autorizado.

## 3. Uso permitido

A plataforma destina-se à gestão de clínicas de fisioterapia e correlatas. É
vedado:

- Utilizar a plataforma para finalidades ilícitas ou para tratar dados de
  pessoas sem base legal adequada;
- Realizar engenharia reversa, descompilação ou tentativa de acesso
  não autorizado;
- Sobrecarregar a infraestrutura por meio de scripts automatizados sem
  autorização.

## 4. Planos e pagamentos

A contratação dos planos pagos segue as condições comerciais vigentes,
publicadas em nossa página de planos. Atrasos no pagamento podem implicar
suspensão do acesso, conforme o regulamento de cobrança.

## 5. Disponibilidade

Empenhamo-nos em manter a plataforma disponível 24/7, ressalvadas janelas de
manutenção programadas e eventos de força maior. Não garantimos
disponibilidade ininterrupta.

## 6. Propriedade intelectual

O software, marcas, layouts e conteúdos da FisioGest Pro são protegidos por
direitos de propriedade intelectual. Os dados inseridos pelo Usuário
permanecem de sua titularidade.

## 7. Limitação de responsabilidade

A FisioGest Pro não se responsabiliza por decisões clínicas tomadas com base
nas informações registradas, sendo o juízo profissional do fisioterapeuta a
única autoridade para tais decisões.

## 8. Rescisão

O Usuário pode encerrar a sua conta a qualquer momento. A FisioGest Pro pode
suspender ou encerrar o acesso em caso de descumprimento destes Termos.

## 9. Foro

Fica eleito o foro da Comarca da sede da FisioGest Pro para dirimir
controvérsias decorrentes destes Termos, salvo disposição legal em contrário.
`,
  },
];

async function seed() {
  console.log("Seeding LGPD policy documents...");
  const now = new Date();

  for (const policy of POLICIES) {
    const existing = await db
      .select()
      .from(schema.policyDocumentsTable)
      .where(
        and(
          eq(schema.policyDocumentsTable.type, policy.type),
          eq(schema.policyDocumentsTable.version, policy.version),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`= ${policy.type} v${policy.version} já existe (id=${existing[0]!.id})`);
      continue;
    }

    // mark previous current of same type as not current
    await db
      .update(schema.policyDocumentsTable)
      .set({ isCurrent: false })
      .where(
        and(
          eq(schema.policyDocumentsTable.type, policy.type),
          eq(schema.policyDocumentsTable.isCurrent, true),
        ),
      );

    const [inserted] = await db
      .insert(schema.policyDocumentsTable)
      .values({
        type: policy.type,
        version: policy.version,
        title: policy.title,
        summary: policy.summary,
        contentMd: policy.contentMd,
        isCurrent: true,
        publishedAt: now,
      })
      .returning();
    console.log(`✓ ${policy.type} v${policy.version} (id=${inserted!.id})`);
  }

  console.log("\n✅ Seed LGPD concluído!");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
