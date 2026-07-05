import { useEffect } from "react";
import { createPortal } from "react-dom";

type ConfirmDialogProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  disabled?: boolean;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = "取消",
  confirmLabel = "确定",
  danger = false,
  disabled = false,
  message,
  onCancel,
  onConfirm,
  open,
  title
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <button
        aria-label="取消确认"
        className="confirm-dialog__backdrop"
        disabled={disabled}
        onClick={onCancel}
        type="button"
      />
      <section className="confirm-dialog__panel">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <button className="confirm-dialog__button" disabled={disabled} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={`confirm-dialog__button ${danger ? "danger" : "primary"}`}
            disabled={disabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
