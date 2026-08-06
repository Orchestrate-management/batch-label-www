import { usePageMeta, useStructuredData } from '../lib/seo';
import { breadcrumbSchema, graph, howToSchema } from '../lib/structured-data';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow, Lead } from '../components/ui/Section';
import { StepIllustration } from '../components/StepIllustration';
import { LabelPreview } from '../components/LabelPreview';
import { CtaBand } from '../components/CtaBand';
import { Button } from '../components/ui/Button';
import { labelContents, LabelContentsList } from '../components/home/WhatsIncluded';

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

const scopeCards = [
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

      {/*
        The three steps, as a walkthrough rather than a stack.

        Each step is a two-column spread: the plate and the step number hold a narrow
        column on the left, sticky on a tall screen so the illustration stays beside the
        prose it belongs to, and the reading column sits on the right at a proper measure.
        A continuous hairline runs down the left of the whole sequence, which is what makes
        three separate spreads read as one process.
       */}
      <Section>
        <ol className="relative space-y-20 border-l border-paper-edge pl-6 sm:space-y-24 sm:pl-12">
          {detailedSteps.map((step, index) =>
          <li
            key={step.title}
            id={`step-${index + 1}`}
            className="relative grid scroll-mt-28 gap-8 lg:grid-cols-[minmax(0,15rem)_1fr] lg:gap-14">

              {/* The bead on the rule. 10px wide, so its centre lands on the hairline at
                  both gutters: 24px of padding at base, 48px from sm up. */}
              <span
              aria-hidden="true"
              className="absolute -left-[1.81rem] top-1.5 h-2.5 w-2.5 rotate-45 border border-clay-500 bg-paper sm:-left-[3.31rem]" />

              <div className="lg:sticky lg:top-28 lg:self-start">
                <p className="bl-figures font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-clay-600">
                  Step {index + 1}
                </p>
                <div className="mt-5">
                  <StepIllustration kind={step.kind} size={148} />
                </div>
              </div>

              <div>
                <h2 className="font-display text-[1.55rem] font-semibold leading-[1.15] text-ink sm:text-[1.95rem]">
                  {step.title}
                </h2>
                <div className="mt-5 space-y-4">
                  {step.paragraphs.map((paragraph) =>
                <p key={paragraph} className="max-w-prose text-[1.02rem] leading-[1.75] text-ink-soft">
                      {paragraph}
                    </p>
                )}
                </div>
                <p className="mt-7 max-w-prose border-l-2 border-clay-500/50 bg-paper-deep py-3.5 pl-5 pr-4 text-[0.92rem] leading-[1.7] text-ink-muted">
                  {step.aside}
                </p>
              </div>
            </li>
          )}
        </ol>
      </Section>

      <Section className="bg-white">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.9fr] lg:items-start lg:gap-16">
          <div>
            <Eyebrow>The output</Eyebrow>
            <Heading>What ends up on the label</Heading>
            <Lead className="mt-4">
              If a line is on the label, it is because CLP requires it for a product like yours.
            </Lead>
            <div className="mt-8">
              <LabelContentsList items={labelContents} />
            </div>
          </div>
          <div className="lg:sticky lg:top-28">
            <LabelPreview />
          </div>
        </div>
      </Section>

      <Section ariaLabelledBy="capabilities-heading">
        <div className="max-w-2xl">
          <Eyebrow>Around the three steps</Eyebrow>
          <Heading id="capabilities-heading">The rest of what it handles</Heading>
          <Lead className="mt-4">
            The jobs that sit either side of the label itself.
          </Lead>
        </div>
        <div className="bl-numbered mt-12 grid gap-px overflow-hidden rounded-[0.5rem] border border-paper-edge bg-paper-edge sm:grid-cols-2">
          {capabilities.map((item) =>
          <div key={item.title} className="bg-white p-6 sm:p-8">
              <span
              aria-hidden="true"
              className="bl-num bl-figures block font-mono text-[0.72rem] font-medium tracking-[0.12em] text-clay-600" />

              <h3 className="mt-3 font-display text-[1.15rem] font-semibold leading-snug text-ink">
                {item.title}
              </h3>
              <p className="mt-2.5 text-[0.95rem] leading-[1.7] text-ink-soft">{item.body}</p>
            </div>
          )}
        </div>
      </Section>

      {/* Scope. Set on the darkest stock with a rule between each entry rather than as
          three cards: these are limits, and a card grid dresses a limit up as a feature. */}
      <Section className="bg-paper-shade">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>Scope</Eyebrow>
            <Heading>What Batchlabel does not do</Heading>
          </div>
          <ul className="divide-y divide-paper-edge border-y border-paper-edge">
            {scopeCards.map((card) =>
            <li key={card.title} className="py-6">
                <h3 className="font-display text-[1.1rem] font-semibold text-ink">{card.title}</h3>
                <p className="mt-2 max-w-prose text-[0.95rem] leading-[1.7] text-ink-soft">
                  {card.body}
                </p>
              </li>
            )}
          </ul>
        </div>
      </Section>

      <CtaBand location="how_it_works_final" />
    </>);

}
