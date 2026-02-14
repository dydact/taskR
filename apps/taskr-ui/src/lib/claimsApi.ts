type ClaimsApiConfig = {
  baseUrl: string;
  tenantId: string;
  userId?: string;
  fetchImpl?: typeof fetch;
};

type RequestOptions = {
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
};

const buildQueryString = (query?: RequestOptions["query"]) => {
  if (!query) return "";
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export class ClaimsApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message?: string) {
    super(message ?? `Claims API request failed with status ${status}`);
  }
}

export const createClaimsApi = (config: ClaimsApiConfig) => {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseLower = config.baseUrl.toLowerCase();
  const isScrHost = baseLower.includes("scr");
  const request = async <T>({ path, method = "GET", query, signal }: RequestOptions): Promise<T> => {
    const url = `${config.baseUrl}${path}${buildQueryString(query)}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-tenant-id": config.tenantId,
        ...(config.userId ? { "x-user-id": config.userId } : {})
      },
      signal
    });

    const contentType = response.headers.get("content-type");
    const payload = contentType && contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      throw new ClaimsApiError(response.status, payload, (payload as any)?.error?.message);
    }

    return payload as T;
  };

  return {
    listClaims: (query?: Record<string, string | number | boolean | undefined | null>) =>
      request<{ data?: ClaimSummary[]; meta?: unknown } | ClaimSummary[]>({
        path: "/v1/claims",
        query
      }),
    getClaimEvents: (claimId: string) =>
      request<{ data?: ClaimEvent[] } | ClaimEvent[]>({
        path: isScrHost ? `/scr/api/claims/${claimId}/events` : `/v1/scr/api/claims/${claimId}/events`
      })
  };
};

export type ClaimSummary = {
  claim_id?: string;
  claimId?: string;
  status?: string;
  payer?: string;
  patient?: string;
  amount?: number;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
};

export type ClaimEvent = {
  timestamp?: string;
  status?: string;
  description?: string;
  [key: string]: unknown;
};
