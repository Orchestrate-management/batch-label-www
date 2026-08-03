import { CheckIcon } from 'lucide-react';
import { Section, Heading, Eyebrow, Lead } from '../ui/Section';
import { LabelPreview } from '../LabelPreview';

export const labelContents = [
'Product name and pack size, with net weight or volume',
'Hazard pictograms at the required minimum size',
'The signal word, Warning or Danger, where one applies',
'Hazard statements, the H codes, in full sentences',
'Precautionary statements, the P codes, chosen and combined',
'Allergen declarations from the fragrance, such as linalool and limonene',
'A place for your UFI, that is a Unique Formula Identifier, set where poison centre rules require it',
'Batch code and date fields',
'Your business name, address and contact details as the supplier',
'Candle and diffuser safety wording, such as burn within sight',
'CLP text set at the minimum size your pack size requires'];


export function WhatsIncluded() {
  return (
    <Section ariaLabelledBy="included-heading">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div>
          <Eyebrow>What is included</Eyebrow>
          <Heading id="included-heading">Everything that goes on the label</Heading>
          <Lead className="mt-3">
            Every line comes from your safety data sheet or from your recipe.
          </Lead>
          <ul className="mt-6 space-y-2.5">
            {labelContents.map((item) =>
            <li key={item} className="flex items-start gap-2.5 text-[0.97rem] leading-relaxed text-ink-soft">
                <CheckIcon size={17} className="mt-1 shrink-0 text-teal-700" aria-hidden="true" />
                {item}
              </li>
            )}
          </ul>
          <p className="mt-6 max-w-prose text-[0.97rem] leading-relaxed text-ink-soft">
            Every line above is on every plan, including Free. Plans differ by how many things you
            sell, never by what goes on the label.
          </p>
        </div>
        <div className="lg:sticky lg:top-24">
          <LabelPreview compact />
        </div>
      </div>
    </Section>);

}