import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./subscription.js", () => ({
  getPlanLimits: vi.fn(),
}));

import { requireFeature } from "./plan-features.js";
import { getPlanLimits } from "./subscription.js";

const getPlanLimitsMock = getPlanLimits as unknown as ReturnType<typeof vi.fn>;

function makeReq(overrides: Record<string, any> = {}) {
  return { isSuperAdmin: false, clinicId: 1, subscriptionInfo: null, ...overrides };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("requireFeature middleware", () => {
  beforeEach(() => {
    getPlanLimitsMock.mockReset();
  });

  it("lets superadmin through without checks", async () => {
    const req = makeReq({ isSuperAdmin: true });
    const res = makeRes();
    const next = vi.fn();

    await requireFeature("module.multi_clinic")(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(getPlanLimitsMock).not.toHaveBeenCalled();
  });

  it("allows access when the plan includes the feature", async () => {
    const req = makeReq({
      subscriptionInfo: { planName: "premium" },
    });
    const res = makeRes();
    const next = vi.fn();

    await requireFeature("module.multi_clinic")(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("blocks with 403 when the plan does NOT include the feature", async () => {
    const req = makeReq({
      subscriptionInfo: { planName: "essencial" },
    });
    const res = makeRes();
    const next = vi.fn();

    await requireFeature("module.patient_subscriptions")(req as any, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toMatchObject({
      error: "Forbidden",
      planRestricted: true,
      feature: "module.patient_subscriptions",
      currentPlan: "essencial",
    });
  });

  it("loads subscriptionInfo on demand when missing", async () => {
    getPlanLimitsMock.mockResolvedValue({ planName: "profissional" });

    const req = makeReq({ subscriptionInfo: null });
    const res = makeRes();
    const next = vi.fn();

    await requireFeature("module.patient_subscriptions")(req as any, res as any, next);

    expect(getPlanLimitsMock).toHaveBeenCalledWith(1);
    expect(next).toHaveBeenCalledOnce();
  });

  it("passes through (legacy compat) when there is no clinicId / planName", async () => {
    const req = makeReq({ clinicId: null, subscriptionInfo: null });
    const res = makeRes();
    const next = vi.fn();

    await requireFeature("module.multi_clinic")(req as any, res as any, next);

    expect(next).toHaveBeenCalledOnce();
    expect(getPlanLimitsMock).not.toHaveBeenCalled();
  });
});
