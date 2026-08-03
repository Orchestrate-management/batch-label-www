/**
 * The product categories Batchlabel covers, and the ones we would like to cover.
 *
 * Only candles and home fragrance are built. Everything else in this file is a
 * direction, not a product. Nothing here should carry a date or imply that a
 * category is in beta, in build, or about to arrive.
 *
 * This is the single source of truth for anything on the site that says which
 * products we cover. The homepage categories section and the About page both
 * render from this array, so they cannot drift apart.
 *
 * A `description` says what the category is, never what the software can do with
 * it. The live card used to end "and download a UK and EU CLP label", which put a
 * file export nothing builds on the home page and on /about — the two highest
 * traffic pages on the site — after it had been struck everywhere else.
 */

/**
 * `live`     — built, and you can label this today.
 * `interest` — not built and not started. We collect interest, nothing more.
 * `idea`     — a direction we have named out loud. No work has happened.
 */
export type VerticalStatus = 'live' | 'interest' | 'idea';

export interface Vertical {
  /** Stable slug, also used as the React key. */
  id: string;
  /** Display name for the category. */
  name: string;
  /** Lifecycle stage. Drives styling and which call to action appears. */
  status: VerticalStatus;
  /** Short human label for the status, e.g. "Available now". */
  statusLabel: string;
  /** One line that sits under the name. */
  tagline: string;
  /** A sentence or two of detail, in plain English. */
  description: string;
  /** The document a maker starts from in this category. */
  inputName: string;
  /** The rules the label is built against. */
  regulation: string;
  /** Concrete example products, used as chips. */
  examples: string[];
  /** Optional call to action. */
  cta?: { label: string; to?: string; href?: string; location: string };
}

export const verticals: Vertical[] = [
  {
    id: 'candles',
    name: 'Candles & home fragrance',
    status: 'live',
    statusLabel: 'Available now',
    tagline: 'The category Batchlabel is built for.',
    description:
      'Upload the safety data sheet from your fragrance supplier, enter your fragrance percentage and pack size, and Batchlabel works out the UK and EU CLP label and shows it at true size.',
    inputName: 'fragrance supplier safety data sheet',
    regulation: 'UK CLP and EU CLP',
    examples: ['Candles', 'Wax melts', 'Reed diffusers', 'Room sprays'],
    cta: { label: 'Make a label free', to: '/sign-up', location: 'verticals_candles' }
  },
  {
    id: 'cosmetics',
    name: 'Cosmetics & skincare',
    status: 'interest',
    statusLabel: 'Not built',
    tagline: 'The one makers ask us for most.',
    description:
      'We have not started this and we will not give you a date. Tell us you want it and we will let you know if that changes. It would cover the label only, so it would never replace a Cosmetic Product Safety Report.',
    inputName: 'ingredient and product information',
    regulation: 'UK and EU cosmetics labelling rules',
    examples: ['Soaps', 'Balms & butters', 'Skincare', 'Bath products'],
    cta: {
      label: 'Tell us you want this',
      href: 'mailto:hello@batchlabel.co.uk?subject=Cosmetics%20labelling',
      location: 'verticals_cosmetics'
    }
  },
  {
    id: 'cpg',
    name: 'Wider consumer goods',
    status: 'idea',
    statusLabel: 'Idea',
    tagline: 'Named, not started.',
    description:
      'Household products, detergents and food contact items turn safety data into label copy too. Same problem, different rules.',
    inputName: 'product safety and regulatory data',
    regulation: 'category specific labelling rules',
    examples: ['Household products', 'Food contact items', 'Detergents']
  },
  {
    id: 'electronics',
    name: 'Electronics & batteries',
    status: 'idea',
    statusLabel: 'Idea',
    tagline: 'Named, not started.',
    description:
      'Conformity marks, warnings and disposal wording, on products that carry a CE or UKCA mark.',
    inputName: 'conformity and technical documentation',
    regulation: 'CE and UKCA marking, WEEE and battery rules',
    examples: ['Consumer electronics', 'Batteries', 'Chargers']
  }
];

/** Categories with a card of their own: the one you can use, and the one you can ask for. */
export const activeVerticals = verticals.filter((v) => v.status !== 'idea');

/** Directions we have named but not started. Rendered as a lighter row. */
export const plannedVerticals = verticals.filter((v) => v.status === 'idea');
