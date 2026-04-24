# FisioGest Pro — Pacote de Produção

Pacote pronto para subir em servidores Node.js (Hostinger VPS / Cloud Hosting,
ou qualquer host que rode Node 22+).

> ⚠️ **Hospedagem compartilhada da Hostinger (planos Premium / Business com
> apenas PHP/Apache) NÃO suporta Node.js.** Use VPS, Cloud Hosting, ou um plano
> que ofereça runtime Node 22+.

## Conteúdo do pacote

```
.
├── server/index.cjs                       # API Express já bundleada (1.5 MB)
├── artifacts/fisiogest/dist/public/       # SPA React (servida pela API em produção)
├── package.json                           # apenas dependências de runtime
├── .env.example                           # variáveis de ambiente — copie para .env
└── README.md
```

## Pré-requisitos

- **Node.js 22.x LTS** (mínimo 22.0.0)
- **PostgreSQL 16+** acessível pela aplicação (Neon, Supabase, RDS, ou local)
- (Opcional) **Conta Cloudinary** para upload de fotos/atestados

## Instalação

1. Envie o conteúdo deste zip para o servidor (via SFTP, painel ou git).
2. Na pasta raiz do projeto, instale dependências de produção:

   ```bash
   npm install --omit=dev
   ```

3. Copie o `.env.example` para `.env` e preencha as variáveis obrigatórias:

   ```bash
   cp .env.example .env
   nano .env
   ```

   Variáveis **obrigatórias**:
   - `DATABASE_URL` — string de conexão PostgreSQL.
   - `JWT_SECRET` — gere com:
     `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
   - `NODE_ENV=production`
   - `CORS_ORIGIN` — URL pública do frontend (ex.: `https://fisiogest.com.br`).

   Variáveis **recomendadas**:
   - `PORT` — porta HTTP (Hostinger geralmente injeta automaticamente).
   - `CLOUDINARY_URL` — para envio de fotos.
   - `LOG_LEVEL=info`

4. Inicie a aplicação:

   ```bash
   npm start
   ```

   ou diretamente:

   ```bash
   NODE_ENV=production node server/index.cjs
   ```

## Configuração no painel da Hostinger (Node.js App)

No hPanel → **Sites → Avançado → Node.js**:

| Campo | Valor |
|---|---|
| Versão do Node | **22.x** |
| Modo da aplicação | **Production** |
| Raiz da aplicação | caminho onde você extraiu o zip |
| URL da aplicação | seu domínio |
| Arquivo de inicialização | `server/index.cjs` |
| Variáveis de ambiente | preencha todas do `.env` aqui |

Em seguida clique em **Run npm install** e depois **Start App**.

## Banco de dados — primeira execução

O servidor **não cria as tabelas automaticamente**. Antes de subir pela primeira
vez, rode as migrações Drizzle a partir do projeto-fonte (não está incluído
neste zip de runtime):

```bash
# no projeto-fonte
pnpm install
pnpm run db:push
pnpm run db:seed   # opcional — usuário admin + dados iniciais
```

Aponte `DATABASE_URL` para o mesmo banco que o pacote de produção vai usar.

## Healthcheck

A aplicação expõe `GET /api/healthz` retornando `200 OK`. Use-a no monitoramento
da Hostinger.

## Atualizando

1. Gere um novo zip com `pnpm run build` no projeto-fonte e reempacote este
   diretório (`dist-prod/`).
2. Substitua os arquivos no servidor.
3. Reinicie a aplicação Node no painel.

## Observações

- O frontend é servido pela própria API a partir de
  `artifacts/fisiogest/dist/public/`. **Não mova essa pasta** — o caminho está
  embutido no bundle.
- O backend roda jobs em background (CRON via `node-cron`). Se você escalar para
  múltiplas réplicas, eles já usam advisory locks do PostgreSQL para não
  duplicar execução.
