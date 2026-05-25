import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SignaturePadHandle {
  /** Returns true iff at least one stroke has been drawn. */
  hasStrokes: () => boolean;
  /** Returns the signature as a PNG `File`, or null if the pad is empty. */
  toFile: (filename?: string) => File | null;
  /** Clears the canvas. */
  clear: () => void;
}

export interface SignaturePadProps {
  height?: number;
}

/**
 * Drawable signature pad used during proof-of-delivery capture. The
 * `toFile` method emits a PNG suitable for the chunked uploader; an empty
 * pad returns null so the caller can enforce Requirement 6.2 (≥ 1 stroke).
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ height = 200 }, ref) {
    const padRef = useRef<SignatureCanvas | null>(null);
    const [hasInk, setHasInk] = useState(false);

    useImperativeHandle(ref, () => ({
      hasStrokes: () => Boolean(padRef.current && !padRef.current.isEmpty()),
      toFile: (filename = "signature.png") => {
        const pad = padRef.current;
        if (!pad || pad.isEmpty()) return null;
        const dataUrl = pad
          .getTrimmedCanvas()
          .toDataURL("image/png");
        const bin = atob(dataUrl.split(",")[1]);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return new File([buf], filename, { type: "image/png" });
      },
      clear: () => {
        padRef.current?.clear();
        setHasInk(false);
      },
    }));

    return (
      <div>
        <div
          className="rounded-lg border-2 border-dashed border-[#D1D5DB] bg-white"
          style={{ height }}
        >
          <SignatureCanvas
            ref={padRef}
            penColor="#111827"
            canvasProps={{
              style: {
                width: "100%",
                height: "100%",
                touchAction: "none",
              },
            }}
            onBegin={() => setHasInk(true)}
          />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-xs text-[#6B7280]">
            {hasInk
              ? "Signature captured."
              : "Ask the PIC to sign in the box above."}
          </p>
          <Button
            type="button"
            variant="outlined"
            size="sm"
            onClick={() => {
              padRef.current?.clear();
              setHasInk(false);
            }}
            leftIcon={<Eraser className="h-3 w-3" />}
          >
            Clear
          </Button>
        </div>
      </div>
    );
  }
);

export default SignaturePad;
