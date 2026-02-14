import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GanttView } from "./GanttView";

// Mock the TaskR client
const mockClient = {
  bridge: {
    schedule: {
      list: vi.fn()
    }
  },
  request: vi.fn()
};

vi.mock("../lib/client", () => ({
  useTaskRClient: () => mockClient
}));

describe("GanttView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: return empty array, will use mock data
    mockClient.bridge.schedule.list.mockResolvedValue([]);
    mockClient.request.mockResolvedValue([]);
  });

  it("renders without crashing", async () => {
    render(<GanttView />);
    await waitFor(() => {
      expect(screen.getByText("Gantt View")).toBeDefined();
    });
  });

  it("displays the header", async () => {
    render(<GanttView />);
    await waitFor(() => {
      expect(screen.getByText("Gantt View")).toBeDefined();
      expect(screen.getByText("Timeline")).toBeDefined();
    });
  });

  it("displays the workflow phases", async () => {
    render(<GanttView />);
    await waitFor(() => {
      expect(screen.getByText("Intake")).toBeDefined();
      expect(screen.getByText("Assessment")).toBeDefined();
      expect(screen.getByText("Authorization")).toBeDefined();
      expect(screen.getByText("Delivery")).toBeDefined();
    });
  });

  it("displays filter dropdowns", async () => {
    render(<GanttView />);
    await waitFor(() => {
      expect(screen.getByText("Status")).toBeDefined();
      expect(screen.getByText("Priority")).toBeDefined();
    });
  });

  it("displays summary statistics", async () => {
    render(<GanttView />);
    await waitFor(() => {
      expect(screen.getByText("Total Items")).toBeDefined();
      expect(screen.getByText("Completed")).toBeDefined();
      expect(screen.getByText("In Progress")).toBeDefined();
      expect(screen.getByText("Delayed")).toBeDefined();
    });
  });

  it("shows loading state initially", () => {
    render(<GanttView />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("loads mock data when API returns empty", async () => {
    mockClient.bridge.schedule.list.mockResolvedValue([]);
    render(<GanttView />);

    await waitFor(() => {
      // Mock data includes "New Client Referral"
      expect(screen.getByText("New Client Referral")).toBeDefined();
    });
  });

  it("displays gantt bars for items", async () => {
    render(<GanttView />);

    await waitFor(() => {
      const bars = document.querySelectorAll(".gantt-bar");
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it("displays refresh button", async () => {
    render(<GanttView />);
    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeDefined();
    });
  });
});
