import { createPortal } from "react-dom";
import { useDialogFocus } from "./useDialogFocus";

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
  const dialogRef = useDialogFocus(open, onCancel);

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="confirm-dialog">
      <button
        aria-label="取消确认"
        className="confirm-dialog__backdrop"
        disabled={disabled}
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="confirm-dialog__panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p>{message}</p>
        <div className="confirm-dialog__actions">
          <button
            className="confirm-dialog__button"
            data-dialog-initial-focus
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
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
