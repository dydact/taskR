import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { ClaimsView } from "./ClaimsView";
import type {
  Claim,
  ClaimsListResponse,
  Transmission,
  TransmissionsResponse,
  ClaimAck,
  AcksResponse,
  Reject,
  RejectsResponse,
  Event,
  EventsResponse,
} from "../types/claims";

vi.mock("../lib/claimsClient", () => {
  const createClaimsClientMock = vi.fn();
  return { createClaimsClient: createClaimsClientMock };
});

const { createClaimsClient } = await import("../lib/claimsClient");
const createClaimsClientMock = createClaimsClient as unknown as ReturnType<typeof vi.fn>;

describe("ClaimsView", () => {
  const listClaimsMock = vi.fn<[], Promise<ClaimsListResponse>>();
  const getClaimMock = vi.fn<[], Promise<Claim>>();
  const listTransmissionsMock = vi.fn<[], Promise<TransmissionsResponse>>();
  const listAcksMock = vi.fn<[], Promise<AcksResponse>>();
  const listRejectsMock = vi.fn<[], Promise<RejectsResponse>>();
  const listEventsMock = vi.fn<[], Promise<EventsResponse>>();
  const listJobEventsMock = vi.fn<[], Promise<EventsResponse>>();

  const clientStub = {
    listClaims: listClaimsMock,
    getClaim: getClaimMock,
    listTransmissions: listTransmissionsMock,
    listAcks: listAcksMock,
    listRejects: listRejectsMock,
    listEvents: listEventsMock,
    listJobEvents: listJobEventsMock,
  };

  const sampleClaim: Claim = {
    id: "claim_1",
    tenantId: 1,
    status: "submitted",
    payerId: "payer_1",
    payerName: "ClaimMD Test",
    totals: { chargeCents: 12500, paidCents: 0, balanceCents: 12500 },
    serviceLines: [],
    createdAt: "2024-06-01T12:00:00Z",
    updatedAt: "2024-06-01T12:30:00Z",
    lastJobId: "job_1",
  };

  const sampleTransmission: Transmission = {
    id: "tx_1",
    jobId: "job_1",
    kind: "x12_837",
    direction: "outbound",
    status: "sent",
    createdAt: "2024-06-01T12:01:00Z",
    updatedAt: "2024-06-01T12:01:00Z",
  };

  const sampleAck: ClaimAck = {
    id: "ack_1",
    jobId: "job_1",
    type: "999",
    status: "accepted",
    control: { isa13: "12345", gs06: "67890", st02: "999" },
    claims: [
      {
        claimId: "claim_1",
        status: "accepted",
        rejects: [],
      },
    ],
    receivedAt: "2024-06-01T12:05:00Z",
  };

  const sampleReject: Reject = {
    id: "reject_1",
    ackId: "ack_1",
    level: "transaction",
    code: "A1",
    description: "Sample reject",
    occurredAt: "2024-06-01T12:05:10Z",
  };

  const sampleEvent: Event = {
    id: "event_1",
    type: "submission.completed",
    level: "success",
    occurredAt: "2024-06-01T12:02:00Z",
    statusAfter: "submitted",
  };

  const sampleJobEvent: Event = {
    id: "event_2",
    type: "ack.received",
    level: "info",
    occurredAt: "2024-06-01T12:05:00Z",
    statusAfter: "acknowledged",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listClaimsMock.mockReset();
    getClaimMock.mockReset();
    listTransmissionsMock.mockReset();
    listAcksMock.mockReset();
    listRejectsMock.mockReset();
    listEventsMock.mockReset();
    listJobEventsMock.mockReset();

    createClaimsClientMock.mockReturnValue(clientStub);
  });

  it("renders claim details, transmissions, acknowledgements, and timeline", async () => {
    listClaimsMock.mockResolvedValue({ data: [sampleClaim], meta: {} });
    getClaimMock.mockResolvedValue(sampleClaim);
    listTransmissionsMock.mockResolvedValue({ data: [sampleTransmission] });
    listAcksMock.mockResolvedValue({ data: [sampleAck] });
    listRejectsMock.mockResolvedValue({ data: [sampleReject] });
    listEventsMock.mockResolvedValue({ data: [sampleEvent] });
    listJobEventsMock.mockResolvedValue({ data: [sampleJobEvent] });

    render(<ClaimsView apiBase="http://localhost:8010" tenantId="tenant-1" userId="user-1" />);

    await waitFor(() => expect(listClaimsMock).toHaveBeenCalled());
    expect(createClaimsClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://localhost:8010",
        tenantId: "tenant-1",
        defaultHeaders: { "x-user-id": "user-1" },
      })
    );

    expect(await screen.findByText("claim_1")).toBeInTheDocument();
    expect(await screen.findByText("x12_837")).toBeInTheDocument();
    expect(await screen.findByText("999")).toBeInTheDocument();
    expect(await screen.findByText("submission.completed")).toBeInTheDocument();
  });

  it("surfaces an error when claim list fails", async () => {
    listClaimsMock.mockRejectedValueOnce(new Error("Failed to reach claims API"));

    render(<ClaimsView apiBase="http://localhost:8010" tenantId="tenant-1" userId="user-1" />);

    expect(await screen.findByText("Failed to reach claims API")).toBeInTheDocument();
    expect(getClaimMock).not.toHaveBeenCalled();
  });
});
