import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { OrderStatus } from "@/types/order";

describe("StatusBadge Component", () => {
  it("should render correctly for valid status PENDING", () => {
    render(<StatusBadge status="PENDING" />);
    const badge = screen.getByText("Pending");
    expect(badge).not.toBeNull();
  });

  it("should render correctly for valid status CONFIRMED", () => {
    render(<StatusBadge status={"CONFIRMED" as OrderStatus} />);
    const badge = screen.getByText("Dikonfirmasi");
    expect(badge).not.toBeNull();
  });

  it("should not crash and fallback gracefully for undefined status", () => {
    render(<StatusBadge status={undefined as unknown as OrderStatus} />);
    const badge = screen.getByText("Unknown");
    expect(badge).not.toBeNull();
  });

  it("should fallback to status code as text for a completely unknown status", () => {
    render(<StatusBadge status={"SOME_UNKNOWN_STATUS" as unknown as OrderStatus} />);
    const badge = screen.getByText("SOME_UNKNOWN_STATUS");
    expect(badge).not.toBeNull();
  });
});
