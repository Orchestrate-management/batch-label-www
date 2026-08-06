/**
 * The invitation email: the one piece of Batchlabel a person meets before they have an account.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS EMAIL CONTAINS NO IMAGES AT ALL, AND THAT IS THE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The brand lockup (`public/brand/batchlabel-lockup-horizontal.svg`) sets "Batchlabel" as live
 * `<text>` in Outfit 600. No part of it can be used here:
 *
 *   - SVG does not render in Outlook for Windows, which draws mail through Word, and Gmail
 *     strips it. The lockup cannot be referenced as-is.
 *   - Rasterising it needs Outfit on the rendering machine, and Outfit is neither installed
 *     nor vendored: `src/index.css` pulls it from Google Fonts at runtime. A render was
 *     attempted with the real woff2 embedded as a data-URI `@font-face`, and the output was
 *     BYTE-IDENTICAL to the same render with no font embedded. qlmanage ignored it and
 *     produced a Helvetica wordmark close enough to ship by accident.
 *     `public/brand/README.md` warns that a bad render is silent. It is.
 *   - No email client loads a webfont, so even a correct pipeline could only ever deliver
 *     Outfit as a picture.
 *   - Pictures are blocked by default in Outlook and in Gmail for unknown senders, which is
 *     exactly what a first-contact invitation is. A remote logo was tried and dropped: an
 *     email whose whole identity is one image has no identity in the state it arrives in.
 *
 * So there is no <img> in this file. The wordmark is TEXT in brand teal, set in the same
 * fallback stack the lockup SVG itself declares, under a clay rule that echoes the mark's
 * short bar. Nothing to block, nothing to fetch, nothing to render wrong, and no dependency
 * on an asset staying at a URL. `public/brand/README.md` sanctions the substitution: for
 * third parties, outline the wordmark or use the Logo component with the webfont loaded. An
 * inbox can do neither.
 *
 * If an image is ever added here, it must be additive: the email has to stay complete and
 * on-brand with images off, because that is how most recipients will first see it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULES THIS FILE IS WRITTEN TO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tables and inline styles, because Word's engine has no flexbox, no grid and no `class`
 * worth relying on. One 600px column. The call to action is a table cell with a background
 * colour rather than a styled `<a>`, so it is still a filled teal box when CSS on links is
 * dropped. The raw URL is printed underneath as text, because a button is the first thing a
 * corporate mail gateway rewrites and the last thing a person can retype from.
 *
 * Every interpolated value is escaped. The business name and the inviter's address are typed
 * by customers, and this string is rendered as HTML in somebody else's client.
 */

/** Brand pack values (public/brand/README.md), inlined because email has no stylesheet. */
const PAPER = '#F3EEE6';
const CARD = '#FBF8F3';
const EDGE = '#E3DACD';
const INK = '#1E1B18';
const INK_SOFT = '#4A443D';
const INK_MUTED = '#6F6559';
const TEAL = '#14514F';
const CLAY = '#B4674A';

/** The lockup's own declared fallback, so text and asset agree on what Outfit degrades to. */
const WORDMARK_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";
/** IBM Plex Sans is the brand body face and no client will load it. This is what it becomes. */
const BODY_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface InviteEmailInput {
  /** Business name as recorded on the account. Customer-typed; escaped here. */
  accountName: string;
  /** The address of whoever sent the invitation. Customer-typed; escaped here. */
  inviterEmail: string;
  /** One of the four roles the database allows. */
  role: string;
  /** Absolute, already-built: {appUrl}/invite/{token}. Never assembled in this file. */
  acceptUrl: string;
  /** Marketing site origin, for the footer address. */
  siteUrl: string;
  /** Whole days the token remains valid. The column default is 7. */
  expiresInDays: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * What each role lets somebody do, in a sentence a maker would say out loud.
 *
 * Deliberately says what they CAN do rather than listing what they cannot: the recipient is
 * deciding whether to accept, not auditing a permission matrix. `viewer` is the one worth
 * being plain about, because "read only" reads as a downgrade unless you say it is free.
 */
const ROLE_SENTENCE: Record<string, string> = {
  owner: 'You will be able to do everything on the account, including billing.',
  admin: 'You will be able to manage products, materials and the people on the account.',
  editor: 'You will be able to create and edit products, materials and labels.',
  viewer: 'You will be able to see everything on the account and change nothing.'
};

const ROLE_NOUN: Record<string, string> = {
  owner: 'an owner',
  admin: 'an admin',
  editor: 'an editor',
  viewer: 'a viewer'
};

/**
 * Escapes the five characters that can end an attribute or open a tag. `&` first, or the
 * escapes escape each other's ampersands.
 */
function esc(value: string): string {
  return String(value ?? '').
    replace(/&/g, '&amp;').
    replace(/</g, '&lt;').
    replace(/>/g, '&gt;').
    replace(/"/g, '&quot;').
    replace(/'/g, '&#39;');
}

export function renderInviteEmail(input: InviteEmailInput): RenderedEmail {
  const role = ROLE_NOUN[input.role] ? input.role : 'editor';
  const roleNoun = ROLE_NOUN[role];
  const roleSentence = ROLE_SENTENCE[role];
  const days = input.expiresInDays;
  const dayWord = days === 1 ? 'day' : 'days';

  const name = esc(input.accountName);
  const inviter = esc(input.inviterEmail);
  const url = esc(input.acceptUrl);

  const subject = `${input.inviterEmail} has invited you to ${input.accountName} on Batchlabel`;

  const text = [
    `${input.inviterEmail} has invited you to join ${input.accountName} on Batchlabel.`,
    '',
    `You would join as ${roleNoun}. ${roleSentence}`,
    '',
    'Open this link to accept:',
    input.acceptUrl,
    '',
    `The link works for ${days} ${dayWord} and once only.`,
    '',
    'Batchlabel turns supplier safety data sheets into CLP labels for candles, wax melts,',
    'diffusers and room sprays.',
    '',
    'If you were not expecting this you can ignore it. Nothing happens until you open the link.',
    '',
    'Questions: hello@batchlabel.xyz'
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAPER};">
<div style="display:none;font-size:1px;color:${PAPER};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">You would join as ${roleNoun}. The link works for ${days} ${dayWord} and once only.</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${PAPER};">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">

<tr><td style="padding:0 0 24px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${WORDMARK_STACK};font-size:28px;font-weight:600;letter-spacing:-0.7px;line-height:1.1;color:${TEAL};padding-bottom:8px;">Batchlabel</td>
</tr><tr>
<td style="font-size:0;line-height:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34" height="3" bgcolor="${TEAL}" style="width:34px;height:3px;font-size:0;line-height:0;border-radius:1.5px;">&nbsp;</td>
<td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>
<td width="18" height="3" bgcolor="${CLAY}" style="width:18px;height:3px;font-size:0;line-height:0;border-radius:1.5px;">&nbsp;</td>
</tr></table>
</td>
</tr></table>
</td></tr>

<tr><td style="background-color:${CARD};border:1px solid ${EDGE};border-radius:14px;padding:36px 36px 32px 36px;">

<p style="margin:0 0 6px 0;font-family:${BODY_STACK};font-size:12px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${CLAY};">Invitation</p>

<h1 style="margin:0 0 18px 0;font-family:${BODY_STACK};font-size:24px;line-height:1.3;font-weight:600;color:${INK};">${inviter} has invited you to ${name}</h1>

<p style="margin:0 0 8px 0;font-family:${BODY_STACK};font-size:16px;line-height:1.6;color:${INK_SOFT};">You would join as ${roleNoun}. ${roleSentence}</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 26px 0;">
<tr><td style="background-color:${TEAL};border-radius:8px;">
<a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${BODY_STACK};font-size:16px;font-weight:600;color:${CARD};text-decoration:none;">Accept the invitation</a>
</td></tr>
</table>

<p style="margin:0 0 6px 0;font-family:${BODY_STACK};font-size:13px;line-height:1.5;color:${INK_MUTED};">If the button does not work, paste this into your browser:</p>
<p style="margin:0 0 22px 0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;line-height:1.5;word-break:break-all;color:${TEAL};">${url}</p>

<p style="margin:0;padding-top:20px;border-top:1px solid ${EDGE};font-family:${BODY_STACK};font-size:13px;line-height:1.6;color:${INK_MUTED};">The link works for ${days} ${dayWord} and once only. If you were not expecting this you can ignore it. Nothing happens until you open the link.</p>

</td></tr>

<tr><td style="padding:24px 8px 0 8px;">
<p style="margin:0 0 4px 0;font-family:${BODY_STACK};font-size:13px;line-height:1.6;color:${INK_MUTED};">Batchlabel turns supplier safety data sheets into CLP labels for candles, wax melts, diffusers and room sprays.</p>
<p style="margin:0;font-family:${BODY_STACK};font-size:13px;line-height:1.6;color:${INK_MUTED};">Questions? Reply to this email or write to <a href="mailto:hello@batchlabel.xyz" style="color:${TEAL};text-decoration:underline;">hello@batchlabel.xyz</a>.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
