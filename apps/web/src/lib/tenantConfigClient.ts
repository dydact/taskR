import type { ClearinghouseConfig, ClearinghouseConfigResponse } from "../types/tenant";

export type TenantConfigClientOptions = {
  baseUrl: string;
  tenantId: string | number;
  bearerToken?: string;
  headers?: Record<string, string>;
};

const DEFAULT_HEADERS = {
  Accept: "application/json",
};

const buildHeaders = (opts: TenantConfigClientOptions, extra?: HeadersInit) => {
  const headers = new Headers(DEFAULT_HEADERS);
  headers.set("X-Tenant-Id", String(opts.tenantId));
  if (opts.bearerToken) headers.set("Authorization", `Bearer ${opts.bearerToken}`);
  if (extra) {
    const appended = new Headers(extra);
    appended.forEach((value, key) => headers.set(key, value));
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
};

export function createTenantConfigClient(opts: TenantConfigClientOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  return {
    async getClearinghouse(): Promise<ClearinghouseConfigResponse> {
      const res = await fetch(`${base}/tenant/config/clearinghouse`, {
        method: "GET",
        headers: buildHeaders(opts),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ClearinghouseConfigResponse;
    },
    async updateClearinghouse(config: ClearinghouseConfig): Promise<ClearinghouseConfigResponse> {
      const res = await fetch(`${base}/tenant/config/clearinghouse`, {
        method: "PUT",
        headers: buildHeaders(opts),
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as ClearinghouseConfigResponse;
    },
  };
}

export type TenantConfigClient = ReturnType<typeof createTenantConfigClient>;
