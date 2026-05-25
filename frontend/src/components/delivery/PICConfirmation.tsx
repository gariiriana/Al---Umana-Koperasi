import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface PICConfirmationProps {
  customerName: string;
  onConfirm: () => void;
  onCancel?: () => void;
  busy?: boolean;
}

/**
 * Step 1 of the proof-of-delivery flow. The form below the confirmation
 * cannot be opened until the courier explicitly acknowledges the PIC is
 * present (Requirement 6.1).
 */
export function PICConfirmation({
  customerName,
  onConfirm,
  onCancel,
  busy,
}: PICConfirmationProps) {
  return (
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-[#FEF3C7] flex items-center justify-center shrink-0">
          <ShieldCheck className="h-5 w-5 text-[#92400E]" />
        </div>
        <div>
          <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]">
            Confirm PIC presence
          </h3>
          <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#6B7280] mt-1">
            Make sure the Person-In-Charge for{" "}
            <span className="font-semibold text-[#111827]">{customerName}</span>{" "}
            is physically present before continuing. Without confirmation,
            proof capture stays locked.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" loading={busy} onClick={onConfirm}>
          Yes, PIC is here
        </Button>
        {onCancel && (
          <Button variant="outlined" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

export default PICConfirmation;
