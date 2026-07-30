import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoredConsent, saveConsent } from '../lib/consent';
import { Button } from './ui/Button';

const OPEN_EVENT = 'bl:open-cookie-settings';

/** Called from the footer link so a maker can change their mind at any time. */
export function openCookieSettings() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = getStoredConsent();
    if (!stored) {
      setVisible(true);
    } else {
      setAnalytics(stored.analytics);
      setMarketing(stored.marketing);
    }

    const onOpen = () => {
      const current = getStoredConsent();
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setShowDetail(true);
      setVisible(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  if (!visible) return null;

  const decide = (choice: {analytics: boolean;marketing: boolean;}) => {
    saveConsent(choice);
    setVisible(false);
    setShowDetail(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-paper-edge bg-white p-4 shadow-[0_-8px_30px_-24px_rgba(27,37,35,0.5)] sm:p-5">
      
      <div className="mx-auto w-full max-w-5xl">
        <h2 id="cookie-title" className="font-display text-base font-semibold text-ink">
          Cookies
        </h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-soft">
          We use cookies that are needed to run the site. We would also like to measure how people
          find us, so we know which adverts are worth paying for. Nothing optional loads until you
          say yes.{' '}
          <Link to="/cookie-policy" className="underline decoration-teal-700/40 underline-offset-2">
            Read our cookie policy
          </Link>
          .
        </p>

        {showDetail ?
        <fieldset className="mt-4 space-y-3 border-0 p-0">
            <legend className="sr-only">Choose which cookies to allow</legend>
            <ToggleRow
            id="consent-essential"
            title="Strictly necessary"
            description="Sign in, security and remembering your cookie choice. Always on."
            checked
            disabled
            onChange={() => undefined} />
          
            <ToggleRow
            id="consent-analytics"
            title="Analytics"
            description="Google Analytics 4, so we can see which pages help and which confuse."
            checked={analytics}
            onChange={setAnalytics} />
          
            <ToggleRow
            id="consent-marketing"
            title="Marketing"
            description="Google Ads and Meta, so we can tell which advert brought you here."
            checked={marketing}
            onChange={setMarketing} />
          
          </fieldset> :
        null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => decide({ analytics: true, marketing: true })}>Accept all</Button>
          <Button variant="secondary" onClick={() => decide({ analytics: false, marketing: false })}>
            Reject optional
          </Button>
          {showDetail ?
          <Button variant="secondary" onClick={() => decide({ analytics, marketing })}>
              Save my choices
            </Button> :

          <Button variant="secondary" onClick={() => setShowDetail(true)}>
              Choose cookies
            </Button>
          }
        </div>
      </div>
    </div>);

}

interface ToggleRowProps {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ id, title, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-paper-edge bg-paper px-3.5 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700" />
      
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-ink-muted">{description}</span>
      </label>
    </div>);

}