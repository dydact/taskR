import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DedicatedView } from "./DedicatedView";

describe("DedicatedView", () => {
  it("renders without crashing", () => {
    render(<DedicatedView />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("displays the title", () => {
    render(<DedicatedView />);
    expect(screen.getByRole("heading", { name: "Dedicated Agents" })).toBeInTheDocument();
  });

  it("displays the description", () => {
    render(<DedicatedView />);
    expect(
      screen.getByText(/Manage dedicated AI agent assignments/)
    ).toBeInTheDocument();
  });

  it("renders the dedicated icon", () => {
    render(<DedicatedView />);
    const icon = document.querySelector(".placeholder-view__icon-wrap svg");
    expect(icon).toBeInTheDocument();
  });

  it("renders all agent entries", () => {
    render(<DedicatedView />);
    const agents = document.querySelectorAll(".dedicated-preview__agent");
    expect(agents.length).toBe(6);
  });

  it("displays agent names", () => {
    render(<DedicatedView />);
    expect(screen.getByText("Kairos")).toBeInTheDocument();
    expect(screen.getByText("Sentinel")).toBeInTheDocument();
    expect(screen.getByText("Oracle")).toBeInTheDocument();
    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText("Nexus")).toBeInTheDocument();
    expect(screen.getByText("Polaris")).toBeInTheDocument();
  });

  it("has the correct variant class", () => {
    render(<DedicatedView />);
    const section = screen.getByRole("region");
    expect(section).toHaveClass("placeholder-view--dedicated");
  });

  it("renders status indicators for each agent", () => {
    render(<DedicatedView />);
    const statusIndicators = document.querySelectorAll(".dedicated-preview__status");
    expect(statusIndicators.length).toBe(6);
  });

  it("renders different status types", () => {
    render(<DedicatedView />);
    const activeStatus = document.querySelectorAll(".dedicated-preview__status--active");
    const busyStatus = document.querySelectorAll(".dedicated-preview__status--busy");
    const idleStatus = document.querySelectorAll(".dedicated-preview__status--idle");

    expect(activeStatus.length).toBe(3);
    expect(busyStatus.length).toBe(1);
    expect(idleStatus.length).toBe(2);
  });

  it("renders agent avatars with icons", () => {
    render(<DedicatedView />);
    const avatars = document.querySelectorAll(".dedicated-preview__avatar");
    expect(avatars.length).toBe(6);

    avatars.forEach((avatar) => {
      expect(avatar.querySelector("svg")).toBeInTheDocument();
    });
  });
});
