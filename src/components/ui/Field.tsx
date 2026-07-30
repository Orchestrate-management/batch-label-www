import React from 'react';

interface FieldProps {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
}

export function Field({
  label,
  name,
  type = 'text',
  value,
  onChange,
  required,
  autoComplete,
  placeholder,
  hint,
  error
}: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
        {!required ? <span className="ml-1 font-normal text-ink-muted">(optional)</span> : null}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-[0.97rem] text-ink placeholder:text-ink-muted/70 ${
        error ? 'border-clay-600' : 'border-ink/15'}`
        } />
      
      {hint ?
      <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p> :
      null}
      {error ?
      <p id={errorId} className="text-xs font-medium text-clay-600">
          {error}
        </p> :
      null}
    </div>);

}

interface CheckboxProps {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
  error?: string;
  /** Label content. May include links (open them in a new tab to preserve form state). */
  children: React.ReactNode;
}

export function Checkbox({ name, checked, onChange, required, error, children }: CheckboxProps) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="flex items-start gap-3 text-sm text-ink-soft">
        <input
          id={name}
          name={name}
          type="checkbox"
          checked={checked}
          required={required}
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border accent-teal-700 ${
          error ? 'border-clay-600' : 'border-ink/25'}`
          } />

        <span className="leading-relaxed">{children}</span>
      </label>
      {error ?
      <p id={errorId} role="alert" className="pl-7 text-xs font-medium text-clay-600">
          {error}
        </p> :
      null}
    </div>);

}

interface AlertProps {
  tone: 'error' | 'success' | 'info';
  children: React.ReactNode;
}

export function Alert({ tone, children }: AlertProps) {
  const tones = {
    error: 'border-clay-600/40 bg-clay-100 text-clay-600',
    success: 'border-teal-600/30 bg-teal-50 text-teal-800',
    info: 'border-paper-edge bg-paper-deep text-ink-soft'
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>
      
      {children}
    </div>);

}