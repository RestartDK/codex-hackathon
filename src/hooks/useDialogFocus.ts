import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(onClose?: () => void, active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const elements = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    elements?.[0]?.focus();
    return () => previous?.focus();
  }, [active]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape' && onClose) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const elements = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { dialogRef, onKeyDown };
}
