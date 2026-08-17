import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Dropdown } from './Dropdown';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, leading, className, children, disabled, ...rest },
  ref,
) {
  const cls = [
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    loading ? 'btn-loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} className={cls} disabled={disabled || loading} {...rest}>
      {leading && <span className="btn-leading">{leading}</span>}
      <span className="btn-label">{children}</span>
    </button>
  );
});

interface SplitButtonProps extends Omit<ButtonProps, 'variant'> {
  menu: ReactNode;
  menuAlign?: 'start' | 'end';
}

export function SplitButton({
  menu,
  menuAlign = 'end',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...rest
}: SplitButtonProps): JSX.Element {
  const cls = ['split-btn', `split-btn-${size}`, className ?? ''].filter(Boolean).join(' ');
  const isDisabled = disabled || loading;

  return (
    <span className={cls}>
      <Button
        {...rest}
        variant="primary"
        size={size}
        loading={loading}
        disabled={isDisabled}
        className="split-btn-main"
      >
        {children}
      </Button>
      <Dropdown
        align={menuAlign}
        trigger={
          <button
            type="button"
            className={`split-btn-caret btn-${size}`}
            disabled={isDisabled}
            aria-label="More actions"
          >
            <span aria-hidden="true">▾</span>
          </button>
        }
      >
        {menu}
      </Dropdown>
    </span>
  );
}
