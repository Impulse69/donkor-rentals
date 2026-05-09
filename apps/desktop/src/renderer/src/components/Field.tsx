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
  className?: string;
  children: ReactNode;
}

export function FieldFrame({ label, hint, error, className, children }: FieldFrameProps): JSX.Element {
  return (
    <label className={`field ${className ?? ''}`.trim()}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
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
  { label, hint, error, containerClass, prefix, mono, className, ...rest },
  ref,
) {
  const inputCls = ['input', mono ? 'is-mono' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <FieldFrame label={label} hint={hint} error={error} className={containerClass}>
      {prefix ? (
        <span className="input-prefix">
          <span className="prefix">{prefix}</span>
          <input ref={ref} className={inputCls} {...rest} />
        </span>
      ) : (
        <input ref={ref} className={inputCls} {...rest} />
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
  { label, hint, error, containerClass, options, placeholder, className, ...rest },
  ref,
) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={containerClass}>
      <select ref={ref} className={`select ${className ?? ''}`.trim()} {...rest}>
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
  { label, hint, error, containerClass, className, ...rest },
  ref,
) {
  return (
    <FieldFrame label={label} hint={hint} error={error} className={containerClass}>
      <textarea ref={ref} className={`textarea ${className ?? ''}`.trim()} {...rest} />
    </FieldFrame>
  );
});
