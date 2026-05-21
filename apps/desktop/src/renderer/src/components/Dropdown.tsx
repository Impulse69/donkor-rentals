import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface DropdownProps {
  /** The button that opens the menu. Must be a single ReactElement. */
  trigger: ReactElement;
  children: ReactNode;
  /** Align the menu to the start of the trigger instead of the end. */
  align?: 'start' | 'end';
}

/**
 * Lightweight headless menu. Closes on outside click, ESC, and on item-click
 * when the item is rendered with `<Dropdown.Item />`. Use for row actions,
 * overflow menus, and any "more actions" button.
 */
export function Dropdown({ trigger, children, align = 'end' }: DropdownProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // Focus first item on open
    requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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

  return (
    <div className="dropdown" ref={rootRef}>
      {triggerEl}
      {open && (
        <div
          ref={menuRef}
          className="dropdown-menu"
          role="menu"
          style={align === 'start' ? { left: 0, right: 'auto' } : undefined}
          onClick={(e) => {
            // Auto-close when an item is clicked (delegated).
            const target = (e.target as HTMLElement).closest('[role="menuitem"]');
            if (target) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
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
