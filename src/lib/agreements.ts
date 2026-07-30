/**
 * Versioned agreements shown at signup and managed in the account area.
 *
 * Whatever the user accepts is captured as a snapshot (id, title, version, url) and
 * stored against their brand membership, so we can always prove which version of a
 * document they agreed to. Bump `version` whenever the wording of the corresponding
 * document materially changes.
 *
 * Marketing email and advertising are SEPARATE consents so each can be given and
 * withdrawn independently. They are asked in different places: marketing email is a box
 * on the signup form, advertising is the cookie banner's marketing toggle and nothing
 * else. See docs/CONSENT.md.
 *
 * The acceptance timestamp is deliberately NOT set here — it is stamped server-side
 * (provisioning trigger / consent endpoint), so it cannot be forged by the browser.
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

/**
 * Bumped from 2026-07-30. The /terms document itself is unchanged; the acceptance screen
 * is not. It now marks the box as required, and it no longer sits beside an advertising
 * checkbox. Without a bump, acceptances made under the old screen and the new one are
 * indistinguishable, and "which version did they accept" is the only question this field
 * exists to answer. The suffix is because both shipped on the same day.
 */
export const TERMS_AGREEMENT: Agreement = {
  id: 'terms_of_service',
  title: 'Terms of Service',
  version: '2026-07-30.2',
  path: '/terms'
};

/** Unchanged: same question, same wording, same place on the form. */
export const MARKETING_EMAIL_AGREEMENT: Agreement = {
  id: 'marketing_emails',
  title: 'Marketing emails',
  version: '2026-07-30',
  path: '/privacy'
};

/**
 * Advertising is no longer a checkbox. It is the cookie banner's marketing toggle, and
 * this record is what the account-level flag stores about that decision.
 *
 * Bumped for that reason: a row at 2026-07-30 was a signup checkbox someone ticked, a row
 * at 2026-07-30.2 is a banner choice. The `path` moves to the cookie policy for the same
 * reason — that is the document in front of a user when the decision is now made. The
 * `id` cannot change: set_consent whitelists it, and older audit rows use it.
 */
export const ADVERTISING_AGREEMENT: Agreement = {
  id: 'advertising',
  title: 'Advertising and retargeting',
  version: '2026-07-30.2',
  path: '/cookie-policy'
};

/**
 * The two consents a user can change after signup. Terms are not withdrawable.
 *
 * Both are still withdrawable, but not in the same place: marketing email in the account
 * area, advertising in cookie settings.
 */
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
 * Builds the consent payload sent as Supabase user metadata at signup.
 *
 * Terms are always accepted (the UI blocks submission otherwise). Marketing email is the
 * one optional box on the form. Advertising is NOT asked here at all — the caller passes
 * the value derived from the cookie banner (advertisingConsentFromBanner), so the record
 * written at signup says exactly what the banner already says.
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

/** A document snapshot with no acceptance attached. Which version was shown, nothing more. */
export interface AgreementDocument {
  id: string;
  title: string;
  version: string;
  url: string;
}

export function agreementDocument(agreement: Agreement): AgreementDocument {
  return {
    id: agreement.id,
    title: agreement.title,
    version: agreement.version,
    url: agreementUrl(agreement)
  };
}

/**
 * The three documents recorded by the OAuth completion step, WITHOUT any accepted flag.
 *
 * Two of them are on screen (Terms, marketing email). The advertising document is not:
 * that decision was made at the cookie banner and is carried here so the audit row still
 * says which wording governed it.
 *
 * The OAuth path deliberately does not send `accepted` inside the snapshot the way the
 * email path does. complete_oauth_signup takes the acceptance as explicit boolean
 * arguments and rebuilds this jsonb itself, adding `accepted` and a server timestamp, so
 * a hand-crafted request cannot claim a tick the user never made.
 */
export function signupAgreementDocuments() {
  return {
    terms: agreementDocument(TERMS_AGREEMENT),
    marketing_email: agreementDocument(MARKETING_EMAIL_AGREEMENT),
    advertising: agreementDocument(ADVERTISING_AGREEMENT)
  };
}
