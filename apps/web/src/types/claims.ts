export type ClaimStatus =
  | "draft"
  | "ready"
  | "queued"
  | "submitted"
  | "acknowledged"
  | "accepted"
  | "paid"
  | "rejected"
  | "voided"
  | "error";

export type JobStatus = "queued" | "in_progress" | "succeeded" | "failed" | "canceled" | "expired";

export type JobType = "claim_submission" | "claim_generation" | "artifact_ingest" | "ack_poll";

export type TransmissionKind = "x12_837" | "x12_999" | "x12_277ca" | "x12_824" | "ta1";

export type TransmissionStatus =
  | "pending"
  | "sent"
  | "ack_pending"
  | "ack_partial"
  | "ack_success"
  | "ack_failure"
  | "error";

export type AckStatus = "accepted" | "accepted_with_errors" | "rejected" | "partial";

export type ControlEnvelope = {
  isa13?: string;
  gs06?: string;
  st02?: string;
  interchangeDate?: string;
  interchangeSender?: string;
  interchangeReceiver?: string;
};

export type ArtifactType =
  | "x12_837"
  | "x12_999"
  | "x12_277ca"
  | "era_835"
  | "supporting_document";

export type ArtifactEncoding =
  | "application/json"
  | "application/x12"
  | "application/pdf"
  | "text/plain";

export type PaginationMeta = {
  page?: number;
  perPage?: number;
  total?: number;
  nextCursor?: string | null;
};

export type Money = {
  currency: string;
  amountCents: number;
};

export type ServiceLine = {
  lineNumber: number;
  code: string;
  description?: string;
  units: number;
  modifiers?: string[];
  diagnosisPointers?: string[];
  charge: Money;
};

export type ClaimControlNumbers = {
  lastISA13?: string;
  lastGS06?: string;
  lastST02?: string;
  lastSubmittedAt?: string;
};

export type Claim = {
  id: string;
  tenantId: number;
  externalKey?: string;
  status: ClaimStatus;
  statusReason?: string;
  payerId: string;
  payerName?: string;
  subscriberId?: string;
  renderingProviderNpi?: string;
  billingProviderNpi?: string;
  serviceDateStart?: string;
  serviceDateEnd?: string;
  filingIndicator?: string;
  metadata?: Record<string, unknown>;
  controlNumbers?: ClaimControlNumbers;
  totals: {
    chargeCents: number;
    paidCents: number;
    balanceCents: number;
  };
  serviceLines?: ServiceLine[];
  submissionCount?: number;
  lastJobId?: string | null;
  contentHash?: string;
  createdAt: string;
  updatedAt: string;
};

export type ClaimCreateRequest = {
  externalKey: string;
  sessionId?: number | null;
  patientId?: number;
  providerId?: number;
  payerId: string;
  payerName?: string;
  subscriberId?: string;
  filingIndicator?: string;
  diagnosisCodes?: string[];
  serviceLines: ServiceLine[];
  notes?: string[];
  metadata?: Record<string, unknown>;
};

export type ClaimPatchRequest = {
  status?: ClaimStatus;
  statusReason?: string;
  appendNote?: string;
  overwriteMetadata?: Record<string, unknown>;
  auditReason?: string;
};

export type ClaimSubmissionRequest = {
  jobOptions?: {
    transportMode?: "filedrop" | "claimmd_api";
    ackTimeoutMinutes?: number;
    priority?: "normal" | "high";
  };
  regenerate837?: boolean;
  artifactId?: string;
};

export type ClaimSubmissionResponse = {
  jobId: string;
  status: JobStatus;
  claimId?: string;
  controlNumbers?: ClaimControlNumbers;
};

export type Transmission = {
  id: string;
  jobId?: string | null;
  kind: TransmissionKind;
  direction: "outbound" | "inbound";
  status: TransmissionStatus;
  controlNumbers?: ClaimControlNumbers;
  expectedAckType?: TransmissionKind;
  ackDeadline?: string | null;
  artifactId?: string;
  payloadHash?: string;
  createdAt: string;
  updatedAt: string;
  ack?: AckMessage;
};

export type AckMessage = {
  id: string;
  ackType: TransmissionKind;
  ackStatus: AckStatus;
  interchangeDate?: string;
  controlNumbers?: ClaimControlNumbers;
  control?: ControlEnvelope;
  codes?: Array<{
    level?: "interchange" | "group" | "transaction" | "service_line";
    code?: string;
    description?: string;
    segmentId?: string;
  }>;
  artifactId?: string;
  payloadHash?: string;
  receivedAt: string;
  rawUri?: string | null;
  metadata?: Record<string, unknown>;
};

export type Reject = {
  id: string;
  ackId?: string | null;
  level: "interchange" | "functional_group" | "transaction" | "detail";
  segmentId?: string;
  elementPosition?: string;
  code: string;
  description?: string;
  followupRecommended?: boolean;
  occurredAt: string;
  payloadHash?: string;
  segment?: string;
  element?: string;
  metadata?: Record<string, unknown>;
  rawUri?: string | null;
};

export type Event = {
  id: string;
  type:
    | "claim.created"
    | "claim.updated"
    | "claim.status_changed"
    | "submission.requested"
    | "submission.started"
    | "submission.completed"
    | "ack.received"
    | "ack.accepted"
    | "ack.rejected"
    | "reject.recorded"
    | "artifact.attached"
    | "job.failed"
    | "job.canceled"
    | "note";
  level: "info" | "success" | "warning" | "error";
  statusBefore?: ClaimStatus;
  statusAfter?: ClaimStatus;
  message?: string;
  reasonCode?: string;
  actor?: { type: "system" | "user" | "vendor"; id?: string };
  occurredAt: string;
  metadata?: Record<string, unknown>;
  contentHash?: string;
};

export type ClaimAckClaim = {
  claimId: string;
  status: AckStatus;
  rejects?: Reject[];
  controlNumbers?: ClaimControlNumbers;
};

export type ClaimAck = {
  id: string;
  jobId?: string | null;
  type: "999" | "277" | "835" | string;
  ackType?: TransmissionKind;
  status: AckStatus;
  control?: ControlEnvelope;
  claims: ClaimAckClaim[];
  artifactId?: string | null;
  rawUri?: string | null;
  receivedAt: string;
  metadata?: Record<string, unknown>;
};

export type Job = {
  id: string;
  tenantId: number;
  type: JobType;
  status: JobStatus;
  idempotencyKey?: string;
  priority?: "normal" | "high";
  request?: Record<string, unknown>;
  result?: Record<string, unknown>;
  erroredAt?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  claimIds?: string[];
  artifactIds?: string[];
  payloadHash?: string;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

export type JobCreateRequest = {
  type: JobType;
  claimIds?: string[];
  artifactIds?: string[];
  options?: Record<string, unknown>;
};

export type Artifact = {
  id: string;
  type: ArtifactType;
  mediaType: ArtifactEncoding;
  description?: string;
  sizeBytes: number;
  sha256?: string;
  createdAt: string;
  expiresAt?: string | null;
};

export type ArtifactUploadResponse = {
  artifact: Artifact;
};

export type ClaimMdPayer = {
  code: string;
  name: string;
  tradingPartnerId?: string;
  enrollmentRequired?: boolean;
  claimType?: "professional" | "institutional";
  stateRestrictions?: string[];
  lastSyncedAt?: string;
};

export type ClaimMdPayerList = {
  data: ClaimMdPayer[];
  meta: PaginationMeta;
};

export type ClaimsListResponse = { data: Claim[]; meta: PaginationMeta };
export type TransmissionsResponse = { data: Transmission[] };
export type RejectsResponse = { data: Reject[] };
export type EventsResponse = { data: Event[] };
export type AcksResponse = { data: ClaimAck[] };
export type JobsListResponse = { data: Job[]; meta: PaginationMeta };
