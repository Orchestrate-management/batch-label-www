/**
 * The four things Batchlabel makes labels for.
 *
 * THIS FILE REPLACES `verticals.ts`, AND THE CHANGE IS NOT A RENAME. That file was a
 * category ladder: a `status` of `live` or `idea`, a `statusLabel`, an `activeVerticals`
 * and a `plannedVerticals` split, and two entries so the reader could compare them. Every
 * one of those existed to answer "which verticals do you cover", and that question stopped
 * having an answer worth a section when home fragrance became the only one. A comparison
 * with one side is not a comparison; it is a card floating in half a grid next to a dashed
 * box, and it invites the reader to wonder what used to be there.
 *
 * So the section it feeds now answers the question a maker actually arrives with — will
 * this handle what I make — and the unit is the product form, not the vertical. All four
 * are built. There is no status field, because with nothing to contrast against a badge
 * saying "Available now" is a badge on everything.
 *
 * WHAT MAY BE WRITTEN HERE. `changes` is the reason the section is worth its space: the
 * calculation is identical for all four and the label is not, so each entry names the thing
 * that is specific to that form. Every one of them is checked against `derive.ts` in the app
 * repo — the EN 15494 wording on candles and melts, the diffuser wording under GPSR, the
 * P261 a room spray gets for being sprayed. If a sentence here cannot be traced to a branch
 * in that file, it does not belong in it.
 *
 * The homepage section and the About page both render from this array, so they cannot drift
 * apart. See POSITIONING.md.
 */

export interface ProductForm {
  /** Stable slug, also used as the React key. */
  id: string;
  /** Display name, plural, as a maker would say it. */
  name: string;
  /** What the thing is, in one line. Never what the software does with it. */
  what: string;
  /** What is specific about labelling this form. Traceable to a branch in the app. */
  changes: string;
  /** The rules this form's label is built against. */
  rules: string;
}

export const productForms: ProductForm[] = [
  {
    id: 'candles',
    name: 'Container candles',
    what: 'Wax poured into a jar or a tin, sold by net weight.',
    changes:
      'The classification follows the fragrance load in the finished wax, not the strength of the neat oil, so the same fragrance can land on a different label in a 180 g tin than in a 30 cl jar. Candle safety wording sits alongside the CLP elements.',
    rules: 'UK CLP, EU CLP and EN 15494'
  },
  {
    id: 'wax-melts',
    name: 'Wax melts',
    what: 'Wax segments, shapes or pots for a warmer, sold by net weight.',
    changes:
      'The same calculation as a candle, and the same standard behind the safety wording, but the wording itself is written for a warmer rather than a flame.',
    rules: 'UK CLP, EU CLP and EN 15494'
  },
  {
    id: 'reed-diffusers',
    name: 'Reed diffusers',
    what: 'A fragrance base in a bottle with reeds, sold by volume.',
    changes:
      'A diffuser runs at a far higher fragrance load than a candle, so hazard statements and allergen declarations appear here that a candle at the same fragrance never triggers. Diffuser safety wording is added on top.',
    rules: 'UK CLP and EU CLP'
  },
  {
    id: 'room-sprays',
    name: 'Room sprays',
    what: 'Fragrance in an alcohol or solvent base, in a spray bottle, sold by volume.',
    changes:
      'The base usually brings flammability into the classification, which changes the pictogram and the signal word. Being sprayed at all adds a precautionary statement of its own.',
    rules: 'UK CLP and EU CLP'
  }
];
