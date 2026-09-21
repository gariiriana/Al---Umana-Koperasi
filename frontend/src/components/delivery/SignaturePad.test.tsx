import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signatureCanvasProps = vi.hoisted(() => ({
  clearOnResize: undefined as boolean | undefined,
}));

vi.mock("react-signature-canvas", () => ({
  default: React.forwardRef(function MockSignatureCanvas(
    props: { clearOnResize?: boolean; canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement> },
    ref: React.ForwardedRef<unknown>,
  ) {
    signatureCanvasProps.clearOnResize = props.clearOnResize;
    React.useImperativeHandle(ref, () => ({
      clear: vi.fn(),
      isEmpty: () => true,
      toDataURL: vi.fn(),
      fromDataURL: vi.fn(),
    }));
    return <canvas data-testid="signature-canvas" {...props.canvasProps} />;
  }),
}));

vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

import { SignaturePad } from "./SignaturePad";

describe("SignaturePad", () => {
  beforeEach(() => {
    signatureCanvasProps.clearOnResize = undefined;
  });

  it("keeps the drawing when a mobile viewport resize event fires", () => {
    render(<SignaturePad />);

    expect(screen.getByTestId("signature-canvas")).toBeTruthy();
    expect(signatureCanvasProps.clearOnResize).toBe(false);
  });
});
