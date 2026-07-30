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
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-[0.97rem] text-ink placeholder:text-ink-muted ${
        error ? 'border-clay-600' : 'border-ink-line'}`
        } />

      {hint ?
      <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p> :
      null}
      {/* role="alert" so the message is announced when it appears, not only when the
          field happens to be read again. Matches the checkbox below. */}
      {error ?
      <p id={errorId} role="alert" className="text-xs font-medium text-clay-600">
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

/**
 * A checkbox that can be marked as required without lying to anyone.
 *
 * A red asterisk is the convention sighted people already read, so it is here. It is not
 * the only signal, because on its own it is worth nothing to someone who cannot see it
 * and worse than nothing to a screen reader, which would announce a bare "star":
 *
 *  - the asterisk is aria-hidden, so it is never read out as punctuation;
 *  - the accessible name ends in "(required)", carried by visually hidden text inside
 *    the label, so the state is part of what the control announces;
 *  - `required` and `aria-required` put the same fact in the semantics, for anything
 *    that reads state rather than name;
 *  - `RequiredKey` below explains the asterisk in words for sighted users.
 *
 * The forms are `noValidate`, so the browser never shows its own message: submission is
 * blocked in the handler and the reason is announced through the `role="alert"` error,
 * which is also wired to the input with aria-describedby.
 */
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
          aria-required={required ? true : undefined}
          aria-describedby={errorId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.checked)}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border accent-teal-700 ${
          error ? 'border-clay-600' : 'border-ink-line'}`
          } />

        <span className="leading-relaxed">
          {children}
          {required ?
          <>
              <span aria-hidden="true" className="ml-1 font-semibold text-clay-600">*</span>
              <span className="sr-only"> (required)</span>
            </> :
          null}
        </span>
      </label>
      {error ?
      <p id={errorId} role="alert" className="pl-7 text-xs font-medium text-clay-600">
          {error}
        </p> :
      null}
    </div>);

}

/**
 * The visible key for the asterisk. Put it with any group that contains a required
 * Checkbox, so the marker is explained rather than assumed.
 *
 * Sighted readers see "Boxes marked * are required." A screen reader hears "Boxes marked
 * with an asterisk are required.", because the character itself is hidden and the words
 * stand in for it.
 */
export function RequiredKey() {
  return (
    <p className="text-xs text-ink-muted">
      Boxes marked{' '}
      <span aria-hidden="true" className="font-semibold text-clay-600">*</span>
      <span className="sr-only">with an asterisk</span> are required.
    </p>);

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