import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg';
export type ModalTone = 'neutral' | 'warn' | 'danger';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Optional sub-line below the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Footer slot. If omitted, no footer is rendered. */
  footer?: ReactNode;
  size?: ModalSize;
  tone?: ModalTone;
  /** When false, clicking the backdrop will not close. Default true. */
  closeOnBackdrop?: boolean;
  /** When false, ESC will not close. Default true. */
  closeOnEsc?: boolean;
  /** Hide the X button in the header. Default false. */
  hideCloseButton?: boolean;
  /** ARIA label override if title is not a plain string. */
  ariaLabel?: string;
  /** Optional ref to the element that should be focused first. */
  initialFocusRef?: React.RefObject<HTMLElement>;
}

const FOCUSABLE =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  tone = 'neutral',
  closeOnBackdrop = true,
  closeOnEsc = true,
  hideCloseButton = false,
  ariaLabel,
  initialFocusRef,
}: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [open]);

  // Capture focus on open; restore on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    // Defer to next tick so the dialog content is in the DOM.
    const handle = requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? firstFocusable(dialogRef.current);
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(handle);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, initialFocusRef]);

  // ESC to close (when allowed).
  useEffect(() => {
    if (!open || !closeOnEsc) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeOnEsc, onClose]);

  const onBackdropClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!closeOnBackdrop) return;
      if (e.target === e.currentTarget) onClose();
    },
    [closeOnBackdrop, onClose],
  );

  const onDialogKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const focusables = collectFocusable(dialogRef.current);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !dialogRef.current?.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

  if (!open) return null;

  const labelledBy = typeof title === 'string' && !ariaLabel ? titleId : undefined;

  const node = (
    <div className="modal-backdrop" onMouseDown={onBackdropClick}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={labelledBy}
        aria-describedby={description ? descId : undefined}
        className={`modal modal-${size}${tone !== 'neutral' ? ` modal-tone-${tone}` : ''}`}
        onKeyDown={onDialogKeyDown}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div style={{ flex: '1 1 auto', minWidth: 0 }}>
            <h2 className="modal-title" id={titleId}>{title}</h2>
            {description && (
              <p
                id={descId}
                className="muted"
                style={{ margin: '4px 0 0', fontSize: 'var(--t-sm)' }}
              >
                {description}
              </p>
            )}
          </div>
          {!hideCloseButton && (
            <button
              type="button"
              className="modal-close"
              aria-label="Close dialog"
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
        {children !== undefined && <div className="modal-body">{children}</div>}
        {footer !== undefined && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'neutral' | 'warn' | 'danger';
  loading?: boolean;
}

/**
 * Compact confirmation dialog. Use this for "Are you sure?" flows —
 * delete, void, retire, cancel-booking, etc.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'neutral',
  loading,
}: ConfirmModalProps): JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      tone={tone}
      initialFocusRef={confirmRef}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={() => { void onConfirm(); }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div style={{ color: 'var(--ink-mute)', lineHeight: 1.55 }}>{body}</div>}
    </Modal>
  );
}

// --- helpers --------------------------------------------------------

function collectFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
  );
}

function firstFocusable(container: HTMLElement | null): HTMLElement | null {
  return collectFocusable(container)[0] ?? null;
}
