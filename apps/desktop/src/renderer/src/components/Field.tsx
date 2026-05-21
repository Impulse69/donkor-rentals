import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode,
} from 'react';

interface FieldFrameProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function FieldFrame({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldFrameProps): JSX.Element {
  return (
    <label className={`field ${className ?? ''}`.trim()}>
      <span className={`field-label${required ? ' field-required' : ''}`}>{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  containerClass?: string;
  prefix?: ReactNode;
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, containerClass, prefix, mono, className, required, ...rest },
  ref,
) {
  const inputCls = [
    'input',
    mono ? 'is-mono' : '',
    error ? 'is-error' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={containerClass}>
      {prefix ? (
        <span className={`input-prefix${error ? ' is-error' : ''}`}>
          <span className="prefix">{prefix}</span>
          <input
            ref={ref}
            className={inputCls}
            required={required}
            aria-invalid={error ? true : undefined}
            {...rest}
          />
        </span>
      ) : (
        <input
          ref={ref}
          className={inputCls}
          required={required}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      )}
    </FieldFrame>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  containerClass?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, containerClass, options, placeholder, className, required, ...rest },
  ref,
) {
  const cls = ['select', error ? 'is-error' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={containerClass}>
      <select
        ref={ref}
        className={cls}
        required={required}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  containerClass?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, containerClass, className, required, ...rest },
  ref,
) {
  const cls = ['textarea', error ? 'is-error' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <FieldFrame label={label} hint={hint} error={error} required={required} className={containerClass}>
      <textarea
        ref={ref}
        className={cls}
        required={required}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </FieldFrame>
  );
});
