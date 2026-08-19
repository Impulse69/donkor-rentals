import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  /*
   * Publish the bar's height so anything else pinned to the bottom of the window
   * can sit clear of it.
   *
   * The toast shelf is pinned bottom-right, which is exactly where this bar puts
   * its primary button — so every toast parked itself on top of the split
   * button's menu arrow and swallowed the click. Reported as the dropdown
   * "beginning to hide" after a couple of state changes, which is precisely when
   * toasts are firing.
   *
   * Measured rather than hardcoded: the bar stacks into a column under 860px,
   * and its buttons wrap, so its height is not a constant.
   */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = (): void => {
      document.documentElement.style.setProperty('--actionbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--actionbar-h');
    };
  }, []);

  return createPortal(
    <div ref={ref} className="invoice-actionbar" role="toolbar" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}
