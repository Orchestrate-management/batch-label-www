import { usePageMeta, useStructuredData } from '../lib/seo';
import { breadcrumbSchema, graph, howToSchema } from '../lib/structured-data';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow, Lead } from '../components/ui/Section';
import { StepIllustration } from '../components/StepIllustration';
import { LabelPreview } from '../components/LabelPreview';
import { CtaBand } from '../components/CtaBand';
import { Button } from '../components/ui/Button';
import { labelContents } from '../components/home/WhatsIncluded';
import { CheckIcon } from 'lucide-react';

const detailedSteps = [
{
  kind: 'upload' as const,
  title: 'Upload your supplier safety data sheet',
  paragraphs: [
  'A safety data sheet, often shortened to SDS, is the document your fragrance oil supplier must give you free of charge. It lists what the fragrance contains and how it is classified.',
  'Drag the PDF in. We pull out the classification, the hazard statements, the allergens you have to declare, and the substances that drive it. If something we need is missing, we tell you which line to ask your supplier about.'],

  aside: 'Takes about a minute. Keep the PDF, because suppliers issue a new version when a fragrance is reformulated.'
},
{
  kind: 'recipe' as const,
  title: 'Enter your fragrance percentage and pack size',
  paragraphs: [
  'Tell us the fragrance load, for example 8 per cent, and the pack size, for example a 180 g candle or a 100 ml diffuser. Add your business name and address, since that has to appear on the label as the supplier.',
  'The classification of your finished product depends on how much fragrance is in it, not on the neat oil. That is the step most spreadsheets get wrong. Change the percentage here and the label changes with it, including which precautionary statements apply.',
  'Sell the same fragrance in a second pack size and that is a second SKU, because it is a second thing on a shelf. It gets its own label.'],

  aside: 'The same fragrance in three pack sizes counts as three SKUs. Your plan sets how many you can hold, and the pricing page defines the unit.'
},
{
  kind: 'download' as const,
  title: 'Check it at true size, then download it',
  paragraphs: [
  'The preview is at true size, so you see the label as it will print. Check your product name, your address and your batch code against it before anything is committed to a roll.',
  'Pictograms and regulated text hold the minimum sizes the rules require, whatever else you change. When it looks right, take it away as a print-ready PDF or an SVG and send it to your label printer.'],

  aside: 'Export is on every plan, including Free, and the file is identical on all of them. Your plan sets how many SKUs you can hold. It has no bearing on what comes out.'
}];

/**
 * What Batchlabel does around the three steps.
 *
 * These four used to be a "what you cannot do today" grid on /pricing, which put a list of
 * absences in front of somebody who had come to see a price. They are the same four facts
 * the other way up: things a maker wants the software to handle, described as capability.
 */
const capabilities = [
{
  title: 'Your UFI, on the label and in the right place',
  body: 'The Unique Formula Identifier is generated and set where the poison centre rules require it, at the size they require. You still make the notification yourself, because that is a submission to an authority rather than a label.'
},
{
  title: 'A label that looks like yours',
  body: 'Choose the label size, set the type size and the line spacing, and put your own logo on it. The regulated text holds its minimum sizes whatever you change around it, so a 40 mm tin still gets legible hazard wording.'
},
{
  title: 'A warning when your supplier reissues',
  body: 'A reformulated fragrance changes the classification, and the classification changes the label. When a new safety data sheet lands for one of your fragrances, we tell you which of your SKUs it touches.'
},
{
  title: 'Every line on every plan',
  body: 'Free builds the same label as Consultant. Same hazard statements, same pictograms at CLP Annex I sizes, same allergen declarations, same export. The plans are metered by how many things you sell.'
}];


export function HowItWorks() {
  usePageMeta({
    title: 'How it works, safety data sheet to label',
    description:
    'Three steps to a CLP label for a candle, wax melt, reed diffuser or room spray. Upload the supplier safety data sheet, enter your recipe and pack size, download it.'
  });

  // Built from detailedSteps above, so the markup is the page. The step anchors below
  // are real ids on the list items, which is what makes the HowToStep urls resolve.
  useStructuredData(
    graph([
    breadcrumbSchema('How it works', '/how-it-works'),
    howToSchema(
      '/how-it-works',
      detailedSteps.map((step, index) => ({
        name: step.title,
        text: step.paragraphs[0],
        anchor: `step-${index + 1}`
      }))
    )])
  );

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From safety data sheet to printed label"
        intro="Three steps. It runs the same way for a candle, a wax melt, a reed diffuser or a room spray, and the differences between them are handled for you.">

        <Button to="/sign-up" size="lg" track={{ label: 'Make a label free', location: 'how_it_works_hero' }}>
          Make a label free
        </Button>
      </PageHero>

      <Section>
        <ol className="space-y-12">
          {detailedSteps.map((step, index) =>
          <li
            key={step.title}
            id={`step-${index + 1}`}
            className="grid gap-5 scroll-mt-24 sm:grid-cols-[56px_1fr] sm:gap-7">
              <StepIllustration kind={step.kind} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                  Step {index + 1}
                </p>
                <h2 className="mt-1 font-display text-[1.35rem] font-semibold leading-snug text-ink sm:text-[1.6rem]">
                  {step.title}
                </h2>
                <div className="mt-3 space-y-3">
                  {step.paragraphs.map((paragraph) =>
                <p key={paragraph} className="max-w-prose text-[1rem] leading-relaxed text-ink-soft">
                      {paragraph}
                    </p>
                )}
                </div>
                <p className="mt-4 rounded-xl border border-paper-edge bg-white px-4 py-3 text-sm text-ink-muted">
                  {step.aside}
                </p>
              </div>
            </li>
          )}
        </ol>
      </Section>

      <Section className="bg-white">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <Eyebrow>The output</Eyebrow>
            <Heading>What ends up on the label</Heading>
            <Lead className="mt-3">
              If a line is on the label, it is because CLP requires it for a product like yours.
            </Lead>
            <ul className="mt-6 space-y-2.5">
              {labelContents.map((item) =>
              <li key={item} className="flex items-start gap-2.5 text-[0.97rem] leading-relaxed text-ink-soft">
                  <CheckIcon size={17} className="mt-1 shrink-0 text-teal-700" aria-hidden="true" />
                  {item}
                </li>
              )}
            </ul>
          </div>
          <LabelPreview />
        </div>
      </Section>

      <Section ariaLabelledBy="capabilities-heading">
        <Eyebrow>Around the three steps</Eyebrow>
        <Heading id="capabilities-heading">The rest of what it handles</Heading>
        <Lead className="mt-3">
          The jobs that sit either side of the label itself.
        </Lead>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {capabilities.map((item) =>
          <div key={item.title} className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">
              <h3 className="font-display text-[1.02rem] font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.body}</p>
            </div>
          )}
        </div>
      </Section>

      <Section className="bg-white">
        <Eyebrow>Scope</Eyebrow>
        <Heading>What Batchlabel does not do</Heading>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
          {
            title: 'It does not approve your label',
            body: 'We build the label against published CLP requirements from your inputs. We do not certify or verify it, and the finished label stays your responsibility as the seller.'
          },
          {
            title: 'It does not check your data',
            body: 'If the safety data sheet is out of date, or the percentage you enter is wrong, the label will be wrong. Garbage in, garbage on the tin.'
          },
          {
            title: 'It does not replace other duties',
            body: 'Poison centre notification, weights and measures rules and packaging duties are all separate. We only do the label.'
          }].
          map((card) =>
          <div key={card.title} className="rounded-2xl border border-paper-edge bg-paper p-5">
              <h3 className="font-display text-[1.02rem] font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.body}</p>
            </div>
          )}
        </div>
      </Section>

      <CtaBand location="how_it_works_final" />
    </>);

}