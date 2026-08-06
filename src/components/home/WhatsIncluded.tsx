import { Section, Heading, Eyebrow, Lead } from '../ui/Section';
import { LabelPreview } from '../LabelPreview';

export const labelContents = [
'Product name and pack size, with net weight or volume',
'Hazard pictograms at the required minimum size',
'The signal word, Warning or Danger, where one applies',
'Hazard statements, the H codes, in full sentences',
'Precautionary statements, the P codes, chosen and combined',
'Allergen declarations from the fragrance, such as linalool and limonene',
'Your UFI, that is a Unique Formula Identifier, generated and set where poison centre rules require it',
'Batch code and date fields',
'Your business name, address and contact details as the supplier',
'Candle, melt, diffuser and spray safety wording, such as burn within sight',
'CLP text set at the minimum size your pack size requires'];


/**
 * The contents list, as a numbered specimen rather than eleven ticks.
 *
 * Eleven rows of the same green check mark is the single most template-looking component
 * on the old site, and it was carrying the most useful content on the page. The list is
 * now indexed and ruled — the numerals in the mono face, a hairline between each row —
 * which is how a contents list is set in print and which also gives the reader a count.
 * Exported so /how-it-works renders the same list from the same array.
 */
export function LabelContentsList({ items }: {items: string[];}) {
  return (
    <ol className="bl-numbered divide-y divide-paper-edge border-y border-paper-edge">
      {items.map((item) =>
      <li
        key={item}
        className="grid grid-cols-[2.25rem_1fr] items-baseline gap-x-1 py-3 text-[0.97rem] leading-[1.55] text-ink-soft">

          <span
          aria-hidden="true"
          className="bl-num bl-figures font-mono text-[0.72rem] font-medium tracking-[0.1em] text-clay-600" />

          <span>{item}</span>
        </li>
      )}
    </ol>);

}

export function WhatsIncluded() {
  return (
    <Section ariaLabelledBy="included-heading" width="wide">
      <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-16">
        <div>
          <Eyebrow>What is included</Eyebrow>
          <Heading id="included-heading">Everything that goes on the label</Heading>
          <Lead className="mt-4">
            Every line comes from your safety data sheet or from your recipe.
          </Lead>
          <div className="mt-8">
            <LabelContentsList items={labelContents} />
          </div>
          <p className="mt-7 max-w-prose text-[0.97rem] leading-[1.65] text-ink-soft">
            Every line above is on every plan, including Free. Plans differ by how many things you
            sell, never by what goes on the label.
          </p>
        </div>
        <div className="lg:sticky lg:top-28">
          <LabelPreview compact />
        </div>
      </div>
    </Section>);

}
