import React, { useEffect, useState } from 'react';
import { Checkbox, Alert } from '../ui/Field';
import {
  MARKETING_EMAIL_AGREEMENT,
  ADVERTISING_AGREEMENT,
  type Agreement } from
'../../lib/agreements';
import {
  fetchConsentPreferences,
  updateConsentPreference,
  type ConsentPreferences } from
'../../lib/consent-preferences';

type PrefKey = 'marketingEmail' | 'advertising';

const ROWS: {key: PrefKey;agreement: Agreement;description: string;}[] = [
{
  key: 'marketingEmail',
  agreement: MARKETING_EMAIL_AGREEMENT,
  description: 'Product tips and offers by email. Unsubscribe any time.'
},
{
  key: 'advertising',
  agreement: ADVERTISING_AGREEMENT,
  description:
  'Use of your email and account details for advertising and retargeting, shared with partners such as Meta and Google.'
}];


export function MarketingPreferences() {
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<ConsentPreferences | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
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

  const toggle = async (key: PrefKey, agreement: Agreement, next: boolean) => {
    if (!prefs || savingId) return;
    const previous = prefs[key];
    setError(null);
    setSavingId(agreement.id);
    setPrefs({ ...prefs, [key]: next }); // optimistic

    const result = await updateConsentPreference(agreement, next);
    setSavingId(null);
    if (result.error) {
      setPrefs({ ...prefs, [key]: previous }); // revert
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
        Both are optional and you can change them whenever you like. Turning one off takes
        effect straight away.
      </p>

      {loading ?
      <p className="mt-4 text-sm text-ink-muted">Loading your preferences...</p> :
      !prefs ?
      <p className="mt-4 text-sm text-ink-muted">
          We could not load your preferences just now. Please refresh the page.
        </p> :

      <div className="mt-4 space-y-4">
          {ROWS.map(({ key, agreement, description }) =>
        <div key={agreement.id}>
              <Checkbox
            name={`pref-${agreement.id}`}
            checked={prefs[key]}
            onChange={(next) => toggle(key, agreement, next)}>

                <span className="font-medium text-ink">{agreement.title}</span>
                <span className="mt-0.5 block text-ink-soft">{description}</span>
              </Checkbox>
              {savingId === agreement.id ?
          <p className="pl-7 text-xs text-ink-muted">Saving...</p> :
          null}
            </div>
        )}
        </div>
      }

      {error ?
      <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div> :
      null}
    </section>);

}
