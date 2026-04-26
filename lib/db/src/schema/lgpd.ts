import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Tipos de política suportados.
 * - `privacy` — Política de Privacidade (LGPD)
 * - `terms`   — Termos de Uso
 */
export const POLICY_TYPES = ["privacy", "terms"] as const;
export type PolicyType = (typeof POLICY_TYPES)[number];

/**
 * Documentos de política versionados.
 * Cada política mantém histórico completo de versões; apenas uma versão
 * por tipo é marcada como `is_current = true`.
 */
export const policyDocumentsTable = pgTable(
  "policy_documents",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // PolicyType
    version: text("version").notNull(), // ex.: "1.0.0", "2026-04"
    title: text("title").notNull(),
    contentMd: text("content_md").notNull(),
    summary: text("summary"), // resumo de mudanças (changelog)
    publishedAt: timestamp("published_at").defaultNow().notNull(),
    isCurrent: boolean("is_current").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    typeVersionUnique: uniqueIndex("policy_documents_type_version_unique").on(
      table.type,
      table.version,
    ),
  }),
);

export const insertPolicyDocumentSchema = createInsertSchema(policyDocumentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPolicyDocument = z.infer<typeof insertPolicyDocumentSchema>;
export type PolicyDocument = typeof policyDocumentsTable.$inferSelect;

/**
 * Registro de aceite de cada usuário a uma versão específica de política.
 * Mantemos a IP e User-Agent para auditoria — exigido pela ANPD em caso
 * de questionamento sobre consentimento.
 */
export const userPolicyAcceptancesTable = pgTable(
  "user_policy_acceptances",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    policyDocumentId: integer("policy_document_id").notNull(),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => ({
    userPolicyUnique: uniqueIndex("user_policy_acceptances_user_policy_unique").on(
      table.userId,
      table.policyDocumentId,
    ),
  }),
);

export const insertUserPolicyAcceptanceSchema = createInsertSchema(
  userPolicyAcceptancesTable,
).omit({ id: true, acceptedAt: true });
export type InsertUserPolicyAcceptance = z.infer<typeof insertUserPolicyAcceptanceSchema>;
export type UserPolicyAcceptance = typeof userPolicyAcceptancesTable.$inferSelect;
