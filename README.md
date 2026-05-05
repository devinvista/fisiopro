# FisioGest Pro

Sistema completo de gestão para clínicas de fisioterapia e saúde — agenda, prontuários, financeiro e portal de agendamento público.

---

## Estrutura do pacote de produção

```
fisiogest-pro/
├── server/
│   ├── start.cjs                  # ← ponto de entrada: .env + migrations + servidor
│   ├── migrate.cjs                # runner de migrations (chamado pelo start.cjs)
│   └── index.cjs                  # API Express bundleada
├── artifacts/
│   └── fisiogest/
│       └── dist/
│           └── public/            # SPA React compilada (servida pela API em produção)
├── db/
│   └── migrations/                # Arquivos SQL de migrations do Drizzle ORM
├── node_modules/                  # Dependências de runtime já instaladas
├── package.json                   # Scripts e dependências de runtime
├── .env.example                   # Variáveis de ambiente — copie para .env
└── README.md
```

---

## Pré-requisitos

| Requisito  | Versão mínima |
|------------|---------------|
| Node.js    | ≥ 22          |
| PostgreSQL  | ≥ 14          |

---

## Deploy no Hostinger (Node.js Hosting)

### 1. Faça upload do ZIP

Extraia o conteúdo de `fisiogest-pro.zip` na raiz do seu site no Hostinger (via File Manager ou FTP/SFTP).

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
nano .env          # preencha todos os valores obrigatórios (veja seção abaixo)
```

### 3. Configure o ponto de entrada no Hostinger

No painel do Hostinger, em **Websites → Manage → Node.js**, defina:

- **Entry point / Startup file:** `server/start.cjs`
- **Node.js version:** 22.x

O `start.cjs` faz automaticamente, a cada inicialização:
1. Carrega o arquivo `.env` da raiz do projeto
2. Aplica todas as migrations SQL pendentes no banco (operação idempotente — seguro rodar várias vezes)
3. Inicia o servidor Express que serve a API e a SPA React

### 4. (Alternativa) Usar PM2

```bash
pm2 start server/start.cjs --name fisiogest-pro
pm2 save
pm2 startup
```

### 5. Configure domínio e SSL

No painel do Hostinger, ative o SSL gratuito (Let's Encrypt) e aponte o domínio para a aplicação Node.js.

---

## Variáveis de ambiente obrigatórias

| Variável              | Descrição                                                     |
|-----------------------|---------------------------------------------------------------|
| `DATABASE_URL`        | String de conexão PostgreSQL (ex: `postgresql://u:p@host/db?sslmode=require`) |
| `JWT_SECRET`          | Chave secreta longa para assinar JWTs (mín. 64 chars)         |
| `NODE_ENV`            | `production`                                                  |
| `PORT`                | Porta do servidor (padrão: `3000`)                            |
| `APP_PUBLIC_URL`      | URL pública do site (ex: `https://app.suaclinica.com.br`)     |
| `CORS_ORIGIN`         | Mesmo valor de `APP_PUBLIC_URL` (para restringir CORS)        |
| `ASAAS_API_KEY`       | Chave de API Asaas (use a chave de **produção** ao ir ao ar)  |
| `ASAAS_BASE_URL`      | `https://api.asaas.com/api/v3` (produção)                    |
| `ASAAS_WEBHOOK_TOKEN` | Token para validação de webhooks do Asaas                     |
| `CLOUDINARY_URL`      | URL Cloudinary: `cloudinary://api_key:api_secret@cloud_name`  |

Veja `.env.example` para a lista completa com descrições.

---

## Gerar JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Verificar saúde da API

```
GET https://seu-dominio.com.br/api/healthz
→ {"status":"ok"}
```

---

## Primeira vez num banco já existente (baseline)

Se o banco já tem tabelas criadas via `drizzle-kit push` (sem histórico de migrations), o servidor vai tentar executar SQL que já foi aplicado e falhar.

**Solução:** adicione `MIGRATE_BASELINE=true` ao `.env` **apenas para o primeiro start**:

```env
# .env — apenas para o primeiro deploy em banco já existente
MIGRATE_BASELINE=true
```

O `start.cjs` vai detectar a variável e registrar todas as migrations como já aplicadas, sem executar o SQL. Após confirmar que subiu corretamente:

```bash
# Remova a linha do .env:
# MIGRATE_BASELINE=true   ← apague esta linha
```

> **Atenção:** deixar `MIGRATE_BASELINE=true` permanentemente faz com que novas migrations nunca sejam aplicadas.

### Variáveis de controle disponíveis

| Variável              | Comportamento                                                                 |
|-----------------------|-------------------------------------------------------------------------------|
| *(ausente)*           | Aplica migrations pendentes normalmente (modo padrão, idempotente)           |
| `MIGRATE_BASELINE=true` | Registra migrations como aplicadas sem executar SQL — use só na 1ª vez     |
| `MIGRATE_SKIP=true`   | Pula migrations completamente (não recomendado)                               |
