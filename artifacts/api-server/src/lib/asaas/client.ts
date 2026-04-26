import type {
  AsaasCustomer,
  AsaasSubscription,
  AsaasPayment,
  AsaasError,
} from "./types.js";

const DEFAULT_BASE_URL = "https://sandbox.asaas.com/api/v3";
const TIMEOUT_MS = 10_000;

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY não definido");
  return key;
}

function getBaseUrl(): string {
  return process.env.ASAAS_BASE_URL ?? DEFAULT_BASE_URL;
}

class AsaasHttpError extends Error {
  constructor(
    public status: number,
    public body: AsaasError | string,
    message: string,
  ) {
    super(message);
    this.name = "AsaasHttpError";
  }
}

async function asaasFetch<T>(
  path: string,
  init: RequestInit & { retry?: boolean } = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        access_token: getApiKey(),
        "User-Agent": "FisioGestPro/1.0",
        ...init.headers,
      },
      signal: controller.signal,
    });

    if (res.status >= 500 && init.retry !== false) {
      clearTimeout(timeout);
      await new Promise((r) => setTimeout(r, 500));
      return asaasFetch<T>(path, { ...init, retry: false });
    }

    if (!res.ok) {
      const text = await res.text();
      let parsed: AsaasError | string;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      throw new AsaasHttpError(res.status, parsed, `Asaas ${res.status}: ${text.slice(0, 200)}`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const asaasClient = {
  customers: {
    create(input: {
      name: string;
      email: string;
      cpfCnpj?: string;
      phone?: string;
      externalReference?: string;
    }): Promise<AsaasCustomer> {
      return asaasFetch<AsaasCustomer>("/customers", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    get(id: string): Promise<AsaasCustomer> {
      return asaasFetch<AsaasCustomer>(`/customers/${id}`);
    },
    update(id: string, input: Partial<AsaasCustomer>): Promise<AsaasCustomer> {
      return asaasFetch<AsaasCustomer>(`/customers/${id}`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  },
  subscriptions: {
    create(input: {
      customer: string;
      billingType: "CREDIT_CARD" | "BOLETO" | "PIX" | "UNDEFINED";
      value: number;
      nextDueDate: string;
      cycle: "MONTHLY" | "YEARLY";
      description?: string;
      externalReference?: string;
    }): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>("/subscriptions", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    get(id: string): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`);
    },
    cancel(id: string): Promise<AsaasSubscription> {
      return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`, {
        method: "DELETE",
      });
    },
    listPayments(id: string): Promise<{ data: AsaasPayment[] }> {
      return asaasFetch<{ data: AsaasPayment[] }>(`/subscriptions/${id}/payments`);
    },
  },
  payments: {
    get(id: string): Promise<AsaasPayment> {
      return asaasFetch<AsaasPayment>(`/payments/${id}`);
    },
    sendReminder(id: string): Promise<unknown> {
      return asaasFetch(`/payments/${id}/notify`, { method: "POST" });
    },
  },
};

export { AsaasHttpError };
