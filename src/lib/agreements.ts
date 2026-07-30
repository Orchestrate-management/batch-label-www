/**
 * Versioned agreements shown at signup and managed in the account area.
 *
 * Whatever the user accepts is captured as a snapshot (id, title, version, url) and
 * stored against their brand membership, so we can always prove which version of a
 * document they agreed to. Bump `version` whenever the wording of the corresponding
 * document materially changes.
 *
 * Marketing email and advertising are SEPARATE consents so each can be given and
 * withdrawn independently. The acceptance timestamp is deliberately NOT set here — it is
 * stamped server-side (provisioning trigger / consent endpoint), so it cannot be forged
 * by the browser.
 */

export interface Agreement {
  /** Stable machine id, also used as consent_events.consent_id. */
  id: string;
  /** Human title shown to the user and stored in the snapshot. */
  title: string;
  /** Version identifier for the document wording. */
  version: string;
  /** App-relative path to the document. */
  path: string;
}

export const TERMS_AGREEMENT: Agreement = {
  id: 'terms_of_service',
  title: 'Terms of Service',
  version: '2026-07-30',
  path: '/terms'
};

export const MARKETING_EMAIL_AGREEMENT: Agreement = {
  id: 'marketing_emails',
  title: 'Marketing emails',
  version: '2026-07-30',
  path: '/privacy'
};

export const ADVERTISING_AGREEMENT: Agreement = {
  id: 'advertising',
  title: 'Advertising and retargeting',
  version: '2026-07-30',
  path: '/privacy'
};

/** The two consents a user can toggle after signup. Terms are not withdrawable. */
export const WITHDRAWABLE_AGREEMENTS: Agreement[] = [
MARKETING_EMAIL_AGREEMENT,
ADVERTISING_AGREEMENT];


export interface ConsentSnapshot {
  id: string;
  title: string;
  version: string;
  url: string;
  accepted: boolean;
}

/** Absolute URL for the document, resolved against the current origin at capture time. */
export function agreementUrl(agreement: Agreement): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}${agreement.path}`;
}

export function consentSnapshot(agreement: Agreement, accepted: boolean): ConsentSnapshot {
  return {
    id: agreement.id,
    title: agreement.title,
    version: agreement.version,
    url: agreementUrl(agreement),
    accepted
  };
}

/**
 * Builds the consent payload sent as Supabase user metadata at signup. Terms are always
 * accepted (the UI blocks submission otherwise); the two marketing consents reflect the
 * optional checkboxes.
 */
export function signupConsents(
marketingEmailOptIn: boolean,
advertisingOptIn: boolean)
{
  return {
    terms: consentSnapshot(TERMS_AGREEMENT, true),
    marketing_email: consentSnapshot(MARKETING_EMAIL_AGREEMENT, marketingEmailOptIn),
    advertising: consentSnapshot(ADVERTISING_AGREEMENT, advertisingOptIn)
  };
}
