# FisioGest Pro

Sistema completo de gestão para clínicas de fisioterapia e saúde — agenda, prontuários, financeiro e portal de agendamento público.

---

## Estrutura do pacote de produção

```
fisiogest-pro/
├── server/
│   └── index.cjs                  # API Express bundleada (Node.js)
├── artifacts/
│   └── fisiogest/
│       └── dist/
│           └── public/            # SPA React compilada (servida pela API)
├── package.json                   # Dependências de runtime
├── .env.example                   # Variáveis de ambiente — copie para .env
└── README.md
```

---

## Pré-requisitos

| Requisito | Versão |
|-----------|--------|
| Node.js   | ≥ 22   |
| npm / pnpm | qualquer |
| PostgreSQL | ≥ 14   |

---

## Deploy no Hostinger (Node.js Hosting)

### 1. Faça upload do ZIP

Extraia o conteúdo do `fisiogest-pro.zip` na raiz do seu site no Hostinger (via File Manager ou FTP/SFTP).

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
nano .env          # preencha todos os valores marcados como obrigatórios
```

Variáveis **obrigatórias**:
- `DATABASE_URL` — string de conexão PostgreSQL
- `JWT_SECRET` — string aleatória longa (mín. 64 chars)
- `NODE_ENV=production`
- `APP_PUBLIC_URL` — URL pública do site (ex: `https://app.suaclinica.com.br`)
- `CORS_ORIGIN` — mesmo valor de `APP_PUBLIC_URL`
- `ASAAS_API_KEY` — chave de produção do Asaas
- `ASAAS_WEBHOOK_TOKEN` — token para validação de webhooks
- `CLOUDINARY_URL` — URL do Cloudinary para upload de fotos

### 3. Instale as dependências de runtime

```bash
npm install --omit=dev
```

### 4. Execute as migrations do banco de dados

```bash
node -e "
const { execSync } = require('child_process');
// Rode as migrations antes de iniciar pela primeira vez
" 
# Ou use o script de migrations diretamente se tiver o código-fonte disponível:
# npx tsx scripts/migrate.ts
```

> **Nota:** Se você tiver acesso ao código-fonte completo, rode `pnpm run db:migrate` antes do primeiro start.  
> Se usar apenas este pacote de produção, execute o SQL das migrations manualmente no banco via pgAdmin ou psql.

### 5. Configure o ponto de entrada no Hostinger

No painel do Hostinger, em **Websites > Manage > Node.js**, defina:

- **Entry point / Startup file:** `server/index.cjs`
- **Node.js version:** 22.x

Ou, se usar PM2:

```bash
pm2 start server/index.cjs --name fisiogest-pro
pm2 save
pm2 startup
```

### 6. Configure o domínio e SSL

No painel do Hostinger ative o SSL gratuito (Let's Encrypt) e aponte o domínio para a aplicação Node.js.

---

## Variáveis de ambiente completas

Veja `.env.example` para a lista completa com descrições.

---

## Gerar JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Saúde da API

Acesse `https://seu-dominio.com.br/api/healthz` para verificar se a API está respondendo.

---

## Suporte

Para dúvidas, consulte a documentação interna ou entre em contato com a equipe de desenvolvimento.
