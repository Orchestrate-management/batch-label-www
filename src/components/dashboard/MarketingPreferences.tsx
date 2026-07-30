/**
 * The account area's consent controls.
 *
 * Marketing email is a real toggle here, because this is the only place it is asked.
 *
 * Advertising is NOT a toggle here. It is the cookie banner's marketing choice, and a
 * second control writing the same flag is how the two records drifted apart in the first
 * place. So this shows what the account currently says and sends the user to cookie
 * settings to change it — one question, one place, one answer.
 */

import { useEffect, useState } from 'react';
import { Checkbox, Alert } from '../ui/Field';
import { Button } from '../ui/Button';
import { openCookieSettings } from '../CookieBanner';
import { MARKETING_EMAIL_AGREEMENT, ADVERTISING_AGREEMENT } from '../../lib/agreements';
import {
  fetchConsentPreferences,
  updateConsentPreference,
  type ConsentPreferences } from
'../../lib/consent-preferences';

export function MarketingPreferences() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<ConsentPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchConsentPreferences().then((result) => {
      if (!active) return;
      setPrefs(result);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const toggleMarketingEmail = async (next: boolean) => {
    if (!prefs || saving) return;
    const previous = prefs.marketingEmail;
    setError(null);
    setSaving(true);
    setPrefs({ ...prefs, marketingEmail: next }); // optimistic

    const result = await updateConsentPreference(MARKETING_EMAIL_AGREEMENT, next);
    setSaving(false);
    if (result.error) {
      setPrefs({ ...prefs, marketingEmail: previous }); // revert
      setError(result.error);
    }
  };

  return (
    <section
      aria-labelledby="marketing-preferences"
      className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">

      <h2 id="marketing-preferences" className="font-display text-[1.1rem] font-semibold text-ink">
        Email and advertising
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
        Both are optional. Email is a box here. Advertising follows the cookie choice you
        made on the site, so it is changed in cookie settings.
      </p>

      {loading ?
      <p className="mt-4 text-sm text-ink-muted">Loading your preferences...</p> :
      !prefs ?
      <p className="mt-4 text-sm text-ink-muted">
          We could not load your preferences just now. Please refresh the page.
        </p> :

      <div className="mt-4 space-y-5">
          <div>
            <Checkbox
            name={`pref-${MARKETING_EMAIL_AGREEMENT.id}`}
            checked={prefs.marketingEmail}
            onChange={toggleMarketingEmail}>

              <span className="font-medium text-ink">{MARKETING_EMAIL_AGREEMENT.title}</span>
              <span className="mt-0.5 block text-ink-soft">
                Product tips and offers by email. Unsubscribe any time.
              </span>
            </Checkbox>
            {saving ? <p className="pl-7 text-xs text-ink-muted">Saving...</p> : null}
          </div>

          <div className="rounded-xl border border-paper-edge bg-paper px-4 py-3">
            <p className="text-sm font-medium text-ink">{ADVERTISING_AGREEMENT.title}</p>
            <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-soft">
              Your email and account details used to build ad audiences with Meta and
              Google. This is the marketing cookie choice, kept in one place so it cannot
              say two different things.
            </p>
            <p className="mt-2 text-sm text-ink">
              Currently{' '}
              <span className="font-medium">{prefs.advertising ? 'on' : 'off'}</span>.
            </p>
            <div className="mt-3">
              <Button variant="secondary" onClick={openCookieSettings}>
                Change in cookie settings
              </Button>
            </div>
          </div>
        </div>
      }

      {error ?
      <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div> :
      null}
    </section>);

}
