interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const { dialogRef, onKeyDown } = useDialogFocus(onCancel);
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div ref={dialogRef} className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={messageId} onKeyDown={onKeyDown} onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId} className="confirm-title">{title}</h3>
        <p id={messageId} className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn btn-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useId } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';

