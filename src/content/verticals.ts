/**
 * Product categories (verticals) that Batchlabel serves, or intends to serve.
 *
 * Batchlabel's core is category-agnostic: take the regulatory or safety data that
 * governs a product, and turn it into a print ready, compliant label in minutes.
 * Candles and home fragrance are the first live vertical and the flagship; other
 * categories are added over time.
 *
 * This is the single source of truth for anything on the site that talks about
 * "which products we cover". Adding a category later (for example, moving Cosmetics
 * from `coming-soon` to `live`) is a data change here, not a rebuild: the homepage
 * categories section, the About roadmap and related copy all render from this array.
 */

export type VerticalStatus = 'live' | 'coming-soon' | 'planned';

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
  /**
   * The document or dataset a maker starts from in this category. The whole
   * product turns "this input" into a compliant label, whatever the category.
   */
  inputName: string;
  /** The regulatory frame the label is built against. */
  regulation: string;
  /** Concrete example products, used as chips. */
  examples: string[];
  /** Optional call to action. Live categories link into the funnel; others to a waitlist. */
  cta?: { label: string; to?: string; href?: string; location: string };
}

/**
 * The category-agnostic promise, kept in one place so hero, About and metadata
 * can stay consistent as the wording is tuned.
 */
export const coreValueProp =
  'Turn the safety and regulatory data behind a product into a print ready, compliant label in minutes.';

export const verticals: Vertical[] = [
  {
    id: 'candles',
    name: 'Candles & home fragrance',
    status: 'live',
    statusLabel: 'Available now',
    tagline: 'The flagship. Live, and the category we know best.',
    description:
      'Upload the safety data sheet from your fragrance supplier, enter your recipe and pack size, and download a UK and EU CLP label. Built with and for small batch makers.',
    inputName: 'fragrance supplier safety data sheet',
    regulation: 'UK CLP and EU CLP',
    examples: ['Candles', 'Wax melts', 'Reed diffusers', 'Room sprays'],
    cta: { label: 'Make a label free', to: '/sign-up', location: 'verticals_candles' }
  },
  {
    id: 'cosmetics',
    name: 'Cosmetics & skincare',
    status: 'coming-soon',
    statusLabel: 'Coming next',
    tagline: 'In build now, with makers who already use us for candles.',
    description:
      'Ingredient and safety data in, a compliant cosmetics label out, with the allergen and INCI wording the rules expect. Labelling only, the same honest scope as today.',
    inputName: 'ingredient and product information',
    regulation: 'UK and EU Cosmetics Regulation labelling',
    examples: ['Soaps', 'Balms & butters', 'Skincare', 'Bath products'],
    cta: {
      label: 'Join the cosmetics waitlist',
      href: 'mailto:hello@batchlabel.co.uk?subject=Cosmetics%20waitlist',
      location: 'verticals_cosmetics'
    }
  },
  {
    id: 'cpg',
    name: 'Wider consumer goods',
    status: 'planned',
    statusLabel: 'On the roadmap',
    tagline: 'The same engine, more product types.',
    description:
      'As the core matures, more everyday consumer products follow, wherever safety or regulatory data has to become correct label copy.',
    inputName: 'product safety and regulatory data',
    regulation: 'category specific labelling rules',
    examples: ['Household products', 'Food contact items', 'Detergents']
  },
  {
    id: 'electronics',
    name: 'Electronics & batteries',
    status: 'planned',
    statusLabel: 'On the roadmap',
    tagline: 'Where compliance marks meet the label.',
    description:
      'Further out, technical product labelling: the marks, warnings and conformity details that regulated electronics have to carry.',
    inputName: 'conformity and technical documentation',
    regulation: 'CE and UKCA marking, WEEE and battery rules',
    examples: ['Consumer electronics', 'Batteries', 'Chargers']
  }
];

/** Categories a maker can act on today or join a list for. */
export const activeVerticals = verticals.filter((v) => v.status !== 'planned');

/** Longer term categories, shown as a lighter "where this is heading" row. */
export const plannedVerticals = verticals.filter((v) => v.status === 'planned');
