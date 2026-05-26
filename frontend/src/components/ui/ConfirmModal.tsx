import { motion, AnimatePresence } from "motion/react";
import { AlertCircle } from "lucide-react";
import { Button } from "./Button";

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "primary" | "secondary" | "danger" | "outlined";
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger",
  loading = false,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-[#E5E7EB] font-['Hanken_Grotesk',system-ui,sans-serif] flex flex-col gap-4 z-10"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            aria-describedby="confirm-modal-message"
          >
            <div className="flex gap-4 items-start">
              <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="confirm-modal-title"
                  className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-[#111827]"
                >
                  {title}
                </h3>
                <p
                  id="confirm-modal-message"
                  className="text-sm text-[#6B7280] mt-1.5 leading-relaxed"
                >
                  {message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-2">
              <Button
                variant="outlined"
                onClick={onClose}
                disabled={loading}
                className="!px-5"
              >
                {cancelText}
              </Button>
              <Button
                variant={confirmVariant}
                onClick={onConfirm}
                loading={loading}
                className="!px-5"
              >
                {confirmText}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default ConfirmModal;
