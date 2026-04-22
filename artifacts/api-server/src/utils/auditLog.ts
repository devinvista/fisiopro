import { db } from "@workspace/db";
import { auditLogTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

interface AuditEntry {
  userId?: number | null;
  userName?: string | null;
  patientId?: number | null;
  action: "create" | "update" | "delete";
  entityType: string;
  entityId?: number | null;
  summary?: string;
}

async function resolveUserName(userId?: number | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const [user] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    return user?.name ?? null;
  } catch {
    return null;
  }
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const userName = entry.userName ?? (await resolveUserName(entry.userId));
    await db.insert(auditLogTable).values({
      userId: entry.userId ?? null,
      userName,
      patientId: entry.patientId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
    });
  } catch (err) {
    console.error("[auditLog] Failed to write audit entry:", err);
  }
}
