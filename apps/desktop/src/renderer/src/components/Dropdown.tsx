import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

interface DropdownProps {
  /** The button that opens the menu. Must be a single ReactElement. */
  trigger: ReactElement;
  children: ReactNode;
  /** Align the menu to the start of the trigger instead of the end. */
  align?: 'start' | 'end';
  /**
   * Render the menu into document.body instead of beside the trigger.
   *
   * An absolutely positioned menu is clipped by any ancestor with
   * `overflow: hidden`. The sidebar has exactly that, so the wide "+ New" panel
   * had its second column sliced off at the 224px rail. Portalling escapes the
   * clip; the menu is then positioned from the trigger's own rect and clamped to
   * the viewport.
   */
  portal?: boolean;
}

/**
 * Lightweight headless menu. Closes on outside click, ESC, and on item-click
 * when the item is rendered with `<Dropdown.Item />`. Use for row actions,
 * overflow menus, and any "more actions" button.
 */
export function Dropdown({ trigger, children, align = 'end', portal = false }: DropdownProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    if (!portal || !rootRef.current) return;
    const anchor = rootRef.current.getBoundingClientRect();
    const menu = menuRef.current?.getBoundingClientRect();
    const width = menu?.width ?? 0;
    const height = menu?.height ?? 0;
    const gutter = 8;

    // Prefer aligning to the trigger, then pull back inside the viewport rather
    // than letting the panel run off the edge.
    let left = align === 'start' ? anchor.left : anchor.right - width;
    left = Math.max(gutter, Math.min(left, window.innerWidth - width - gutter));

    // Flip above the trigger when there is not room below.
    const below = anchor.bottom + gutter;
    const top = below + height > window.innerHeight - gutter
      ? Math.max(gutter, anchor.top - height - gutter)
      : below;

    setPosition({ position: 'fixed', top, left, right: 'auto' });
  }, [align, portal]);

  useLayoutEffect(() => {
    if (!open || !portal) return;
    place();
  }, [open, portal, place]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      const target = e.target as Node;
      // With a portal the menu is not inside rootRef, so it has to be checked
      // separately or clicking the menu would close it.
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    function onReflow(): void {
      if (portal) place();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    // Focus first item on open
    requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, portal, place]);

  const triggerEl = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: (e: React.MouseEvent) => {
          (trigger.props as { onClick?: (e: React.MouseEvent) => void }).onClick?.(e);
          if (!e.defaultPrevented) setOpen((v) => !v);
        },
      })
    : trigger;

  const menu = open ? (
    <div
      ref={menuRef}
      className={portal ? 'dropdown-menu dropdown-menu-portal' : 'dropdown-menu'}
      role="menu"
      style={
        portal
          ? // Keep it out of sight until measured, or it flashes at 0,0.
            (position ?? { position: 'fixed', visibility: 'hidden' })
          : align === 'start'
            ? { left: 0, right: 'auto' }
            : undefined
      }
      onClick={(e) => {
        // Auto-close when an item is clicked (delegated).
        const target = (e.target as HTMLElement).closest('[role="menuitem"]');
        if (target) setOpen(false);
      }}
    >
      {children}
    </div>
  ) : null;

  return (
    <div className="dropdown" ref={rootRef}>
      {triggerEl}
      {portal && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}

interface ItemProps {
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

Dropdown.Item = function DropdownItem({ onSelect, danger, disabled, children }: ItemProps): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`dropdown-item${danger ? ' is-danger' : ''}`}
      onClick={() => onSelect?.()}
    >
      {children}
    </button>
  );
};

Dropdown.Divider = function DropdownDivider(): JSX.Element {
  return <div className="dropdown-divider" role="separator" />;
};
