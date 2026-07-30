import { Button } from '../ui/Button';

/**
 * Google's own four-colour G. Their branding terms require the unmodified mark next to
 * the words "Continue with Google" or "Sign in with Google", so it is inlined here as
 * paths rather than restyled or swapped for a generic icon.
 */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.28-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.55 10.78l7.98-6.19z" />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.9l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>);

}

interface GoogleButtonProps {
  onClick: () => void;
  disabled?: boolean;
  /** Where the press happened, for the cta_click event. */
  location: string;
  label?: string;
}

export function GoogleButton({ onClick, disabled, location, label }: GoogleButtonProps) {
  const text = label ?? 'Continue with Google';
  return (
    <Button
      variant="secondary"
      fullWidth
      disabled={disabled}
      onClick={onClick}
      track={{ label: text, location }}>

      <GoogleMark />
      {text}
    </Button>);

}

/** A plain "or" rule, used to separate Google from the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-paper-edge" />
      <span className="text-xs uppercase tracking-wide text-ink-muted">or</span>
      <span className="h-px flex-1 bg-paper-edge" />
    </div>);

}
