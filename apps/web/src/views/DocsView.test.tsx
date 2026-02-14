import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocsView } from "./DocsView";

describe("DocsView", () => {
  it("renders without crashing", () => {
    render(<DocsView />);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("displays the title", () => {
    render(<DocsView />);
    expect(screen.getByRole("heading", { name: "Documents" })).toBeInTheDocument();
  });

  it("displays the description", () => {
    render(<DocsView />);
    expect(
      screen.getByText(/Knowledge management and documentation/)
    ).toBeInTheDocument();
  });

  it("renders the docs icon", () => {
    render(<DocsView />);
    const icon = document.querySelector(".placeholder-view__icon-wrap svg");
    expect(icon).toBeInTheDocument();
  });

  it("renders document preview cards", () => {
    render(<DocsView />);
    const cards = document.querySelectorAll(".docs-preview__card");
    expect(cards.length).toBe(3);
  });

  it("displays document titles", () => {
    render(<DocsView />);
    expect(screen.getByText("Care Coordination Guide")).toBeInTheDocument();
    expect(screen.getByText("Billing Templates")).toBeInTheDocument();
    expect(screen.getByText("Integration Specs")).toBeInTheDocument();
  });

  it("displays document metadata", () => {
    render(<DocsView />);
    expect(screen.getByText("Updated 2 days ago")).toBeInTheDocument();
    expect(screen.getByText("12 templates")).toBeInTheDocument();
    expect(screen.getByText("API Reference")).toBeInTheDocument();
  });

  it("has the correct variant class", () => {
    render(<DocsView />);
    const section = screen.getByRole("region");
    expect(section).toHaveClass("placeholder-view--docs");
  });

  it("renders document icons in each card", () => {
    render(<DocsView />);
    const cardIcons = document.querySelectorAll(".docs-preview__icon svg");
    expect(cardIcons.length).toBe(3);
  });

  it("renders placeholder lines in each card", () => {
    render(<DocsView />);
    const lines = document.querySelectorAll(".docs-preview__line");
    expect(lines.length).toBe(9);
  });
});
