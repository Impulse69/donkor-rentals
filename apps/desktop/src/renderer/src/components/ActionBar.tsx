import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ActionBarProps {
  label: string;
  children: ReactNode;
}

/**
 * The bar of primary actions pinned to the bottom of a detail page.
 *
 * Rendered into document.body rather than in place, for the same reason the
 * dropdown menus are: the page it belongs to is not a usable positioning
 * context. `.fade-up` animates `transform: translateY()` with
 * `animation-fill-mode: both`, so the final transform sticks permanently and the
 * page becomes the containing block for any `position: fixed` descendant. The
 * bar then measured its offsets against the 1180px-wide page instead of the
 * window — landing 256px in from the left and 281px below the bottom of the
 * screen, and drifting as the page scrolled.
 *
 * Sticky had its own version of the problem: it resolves against the scrollport
 * while the page carries a large padding-bottom, so the bar unstuck early and
 * left a gap under itself.
 *
 * Out here the only thing between the bar and the window is the shell, whose
 * sidebar is a known width, so the CSS can span the main column exactly.
 */
export function ActionBar({ label, children }: ActionBarProps): JSX.Element {
  return createPortal(
    <div className="invoice-actionbar" role="toolbar" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
