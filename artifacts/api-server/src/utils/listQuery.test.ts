import { describe, it, expect } from "vitest";
import { listQuerySchema, parseSort } from "./listQuery.js";

describe("listQuerySchema - empty string handling", () => {
  it("treats empty `q` as undefined", () => {
    const result = listQuerySchema.safeParse({ q: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.q).toBeUndefined();
  });

  it("treats whitespace-only `q` as undefined", () => {
    const result = listQuerySchema.safeParse({ q: "   " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.q).toBeUndefined();
  });

  it("accepts a non-empty `q`", () => {
    const result = listQuerySchema.safeParse({ q: "joão" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.q).toBe("joão");
  });

  it("treats empty `from`/`to` as undefined", () => {
    const result = listQuerySchema.safeParse({ from: "", to: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.from).toBeUndefined();
      expect(result.data.to).toBeUndefined();
    }
  });

  it("rejects invalid `from` format", () => {
    const result = listQuerySchema.safeParse({ from: "2026/04/23" });
    expect(result.success).toBe(false);
  });

  it("treats empty `status` as undefined", () => {
    const result = listQuerySchema.safeParse({ status: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toBeUndefined();
  });

  it("splits comma-separated `status` into array", () => {
    const result = listQuerySchema.safeParse({ status: "agendado,confirmado" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toEqual(["agendado", "confirmado"]);
  });

  it("treats empty `sort` as undefined", () => {
    const result = listQuerySchema.safeParse({ sort: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sort).toBeUndefined();
  });

  it("rejects invalid `sort` format", () => {
    const result = listQuerySchema.safeParse({ sort: "1bad-name!" });
    expect(result.success).toBe(false);
  });

  it("treats empty `cursor` as undefined", () => {
    const result = listQuerySchema.safeParse({ cursor: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.cursor).toBeUndefined();
  });

  it("coerces string `limit` into a number", () => {
    const result = listQuerySchema.safeParse({ limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(50);
  });

  it("rejects `limit` outside 1..100", () => {
    expect(listQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("accepts the typical frontend query (search blank + limit)", () => {
    const result = listQuerySchema.safeParse({ q: "", limit: "50" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBeUndefined();
      expect(result.data.limit).toBe(50);
    }
  });
});

describe("parseSort", () => {
  it("returns undefined when sort is missing", () => {
    expect(parseSort(undefined)).toBeUndefined();
  });

  it("parses ascending sort", () => {
    expect(parseSort("createdAt")).toEqual({ field: "createdAt", direction: "asc" });
  });

  it("parses descending sort with `-` prefix", () => {
    expect(parseSort("-createdAt")).toEqual({ field: "createdAt", direction: "desc" });
  });
});
