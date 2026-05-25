import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";
import { ProofCapture } from "../components/delivery/ProofCapture";

interface CustomWindow extends Window {
  mockSignatureHasStrokes?: boolean;
  mockSignatureFile?: File | null;
}

const customWindow = window as unknown as CustomWindow;

// Mock child components and APIs
vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, onClick, loading }: { children: React.ReactNode; onClick?: () => void; loading?: boolean }) => (
    <button onClick={onClick} disabled={loading}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/delivery/SignaturePad", () => {
  return {
    SignaturePad: React.forwardRef<
      { hasStrokes: () => boolean; toFile: () => File | null; clear: () => void },
      Record<string, never>
    >((_, ref) => {
      React.useImperativeHandle(ref, () => ({
        hasStrokes: () => customWindow.mockSignatureHasStrokes ?? false,
        toFile: () => customWindow.mockSignatureFile ?? null,
        clear: () => {},
      }));
      return <div>Mocked Signature Pad</div>;
    }),
  };
});

vi.mock("../services/chunkUploadService", () => ({
  uploadFileInChunks: vi.fn().mockResolvedValue({ fileId: "mock_file_id" }),
  ChunkUploadError: class extends Error {
    code: string;
    constructor(code: string, msg: string) {
      super(msg);
      this.code = code;
    }
  },
}));

vi.mock("../services/orderService", () => ({
  confirmDelivery: vi.fn().mockResolvedValue({}),
}));

describe("Proof of Delivery Capture Validation (Property 18)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customWindow.mockSignatureHasStrokes = false;
    customWindow.mockSignatureFile = null;
  });

  it("should enforce validation rules on submission based on photo and signature presence", () => {
    fc.assert(
      fc.property(
        fc.boolean(), // hasPhoto
        fc.boolean(), // hasSignatureStrokes
        (hasPhoto, hasSignatureStrokes) => {
          // Reset document body between runs to avoid test pollution
          document.body.innerHTML = "";

          render(
            <ProofCapture
              orderId="order_123"
              customerName="Gari Iriana"
              onComplete={() => {}}
            />
          );

          // Simulate photo attachment if hasPhoto is true
          if (hasPhoto) {
            const fileInput = document.querySelector('input[type="file"]');
            expect(fileInput).not.toBeNull();
            const file = new File(["dummy_content"], "test.png", { type: "image/png" });
            fireEvent.change(fileInput!, { target: { files: [file] } });
          }

          // Set global mocks for the signature pad ref
          customWindow.mockSignatureHasStrokes = hasSignatureStrokes;
          customWindow.mockSignatureFile = hasSignatureStrokes
            ? new File(["sig"], "signature.png", { type: "image/png" })
            : null;

          // Click submit
          const submitBtn = screen.getByText("Submit proof");
          fireEvent.click(submitBtn);

          // Verify validation outcomes
          if (!hasPhoto) {
            expect(screen.queryByText("Photo proof is required.")).not.toBeNull();
          } else if (!hasSignatureStrokes) {
            expect(
              screen.queryByText("Signature is required (at least one stroke).")
            ).not.toBeNull();
          } else {
            // Both present, error alerts should not be on screen
            expect(screen.queryByText("Photo proof is required.")).toBeNull();
            expect(
              screen.queryByText("Signature is required (at least one stroke).")
            ).toBeNull();
          }
        }
      ),
      { numRuns: 10 } // Limit runs for DOM performance in tests
    );
  });
});
