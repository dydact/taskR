import type {
  Artifact,
  ArtifactType,
  Claim,
  ClaimCreateRequest,
  ClaimMdPayerList,
  ClaimMdPayer,
  ClaimPatchRequest,
  ClaimSubmissionRequest,
  ClaimSubmissionResponse,
  ClaimsListResponse,
  EventsResponse,
  Job,
  JobCreateRequest,
  JobStatus,
  JobsListResponse,
  RejectsResponse,
  Transmission,
  TransmissionsResponse,
  ArtifactUploadResponse,
  AcksResponse,
} from "../types/claims";

type Fetcher = typeof fetch;

export type ClaimsClientOptions = {
  baseUrl: string;
  tenantId: string | number;
  bearerToken?: string;
  getIdempotencyKey?: () => string;
  fetcher?: Fetcher;
  defaultHeaders?: Record<string, string>;
};

export type ListClaimsParams = {
  status?: string[];
  payerId?: string;
  jobId?: string;
  since?: string;
  page?: number;
  perPage?: number;
};

export type ListJobsParams = {
  type?: string[];
  status?: JobStatus[];
  claimId?: string;
  page?: number;
  perPage?: number;
};

export type ListPayersParams = {
  query?: string;
  state?: string;
  enrollmentRequired?: boolean;
  page?: number;
  perPage?: number;
};

const DEFAULT_IDEMPOTENCY = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const buildQuery = (params: Record<string, unknown> | undefined) => {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.append(key, value.join(","));
    } else {
      search.append(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
};

export function createClaimsClient(opts: ClaimsClientOptions) {
  const {
    baseUrl,
    tenantId,
    bearerToken,
    getIdempotencyKey = DEFAULT_IDEMPOTENCY,
    fetcher = fetch,
    defaultHeaders = {},
  } = opts;

  const base = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit & { idempotency?: boolean } = {}): Promise<T> {
    const headers = new Headers(defaultHeaders);
    headers.set("Accept", "application/json");
    headers.set("X-Tenant-Id", String(tenantId));
    if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);
    if (init.headers) {
      const extra = new Headers(init.headers as HeadersInit);
      extra.forEach((value, key) => headers.set(key, value));
    }
    if (init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    }
    if (init.idempotency) {
      headers.set("Idempotency-Key", headers.get("Idempotency-Key") || getIdempotencyKey());
    }
    const res = await fetcher(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Claims API ${res.status} ${res.statusText}: ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return res.json() as Promise<T>;
    }
    return (await res.text()) as unknown as T;
  }

  return {
    listClaims(params?: ListClaimsParams) {
      return request<ClaimsListResponse>(`/v1/claims${buildQuery(params)}`);
    },
    getClaim(claimId: string) {
      return request<Claim>(`/v1/claims/${claimId}`);
    },
    createClaim(payload: ClaimCreateRequest, idempotencyKey?: string) {
      const body = JSON.stringify(payload);
      return request<Claim>("/v1/claims", {
        method: "POST",
        body,
        idempotency: true,
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      });
    },
    updateClaim(claimId: string, payload: ClaimPatchRequest, idempotencyKey?: string) {
      const body = JSON.stringify(payload);
      return request<Claim>(`/v1/claims/${claimId}`, {
        method: "PATCH",
        body,
        idempotency: true,
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      });
    },
    submitClaim(claimId: string, payload?: ClaimSubmissionRequest, idempotencyKey?: string) {
      const body = payload ? JSON.stringify(payload) : undefined;
      return request<ClaimSubmissionResponse>(`/v1/claims/${claimId}/submission`, {
        method: "POST",
        body,
        idempotency: true,
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      });
    },
    listTransmissions(claimId: string) {
      return request<TransmissionsResponse>(`/scr/api/claims/${claimId}/transmissions`);
    },
    listAcks(claimId: string) {
      return request<AcksResponse>(`/scr/api/claims/${claimId}/acks`);
    },
    listRejects(claimId: string) {
      return request<RejectsResponse>(`/scr/api/claims/${claimId}/rejects`);
    },
    listEvents(claimId: string, since?: string) {
      return request<EventsResponse>(`/scr/api/claims/${claimId}/events${buildQuery({ since })}`);
    },
    listJobs(params?: ListJobsParams) {
      return request<JobsListResponse>(`/v1/jobs${buildQuery(params)}`);
    },
    getJob(jobId: string) {
      return request<Job>(`/v1/jobs/${jobId}`);
    },
    listJobEvents(jobId: string) {
      return request<EventsResponse>(`/scr/api/claims/transport/jobs/${jobId}/events`);
    },
    createJob(payload: JobCreateRequest, idempotencyKey?: string) {
      return request<Job>("/v1/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
        idempotency: true,
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      });
    },
    uploadArtifact(type: ArtifactType, file: File | Blob, options?: { description?: string; retentionDays?: number }, idempotencyKey?: string) {
      const form = new FormData();
      form.append("type", type);
      form.append("file", file);
      if (options?.description) form.append("description", options.description);
      if (options?.retentionDays) form.append("retentionDays", String(options.retentionDays));
      return request<ArtifactUploadResponse>("/v1/artifacts", {
        method: "POST",
        body: form,
        idempotency: true,
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      });
    },
    getArtifact(artifactId: string) {
      return request<Artifact>(`/v1/artifacts/${artifactId}`);
    },
    listClaimMdPayers(params?: ListPayersParams) {
      return request<ClaimMdPayerList>(`/v1/vendors/claimmd/payers${buildQuery(params)}`);
    },
    getClaimMdPayer(code: string) {
      return request<ClaimMdPayer>(`/v1/vendors/claimmd/payers/${code}`);
    },
  };
}

export type ClaimsClient = ReturnType<typeof createClaimsClient>;
