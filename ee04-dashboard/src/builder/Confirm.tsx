/** Minimal confirm dialog overlay. Used for destructive/expensive actions. */
export function Confirm({
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm-overlay" role="presentation" onClick={onCancel}>
      <div className="confirm-box" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <strong>{title}</strong>
        <p>{body}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
