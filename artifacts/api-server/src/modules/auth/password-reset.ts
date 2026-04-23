import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { passwordResetTokensTable, usersTable } from "@workspace/db";
import { and, eq, gt, isNull } from "drizzle-orm";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function generateResetToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export const passwordResetRepository = {
  async createToken(userId: number, tokenHash: string) {
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await db.insert(passwordResetTokensTable).values({
      userId,
      tokenHash,
      expiresAt,
    });
    return expiresAt;
  },

  async findActiveByHash(tokenHash: string) {
    const now = new Date();
    const rows = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, now),
        ),
      )
      .limit(1);
    return rows[0];
  },

  async markUsed(tokenId: number) {
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, tokenId));
  },

  async invalidateAllForUser(userId: number) {
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.userId, userId),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );
  },

  async updateUserPassword(userId: number, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, userId));
  },
};
