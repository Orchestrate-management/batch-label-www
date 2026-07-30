import { usePageMeta } from '../lib/seo';
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
  'Drag the PDF in. We pull out the hazard classification, the hazard statements, the allergens that have to be declared, and the substances that drive the classification. If a value we need is missing, we say exactly which line to ask your supplier about rather than quietly guessing.'],

  aside: 'Takes about a minute. Keep the PDF, because suppliers issue a new version when a fragrance is reformulated.'
},
{
  kind: 'recipe' as const,
  title: 'Enter your fragrance percentage and pack size',
  paragraphs: [
  'Tell us the fragrance load, for example 8 per cent, and the pack size, for example a 180 g candle or a 100 ml diffuser. Add your business name and address, since that has to appear on the label as the supplier.',
  'The classification of your finished product depends on how much fragrance is in it, not on the neat oil. That is the step most spreadsheets get wrong. Change the percentage here and everything downstream updates, including which precautionary statements apply.',
  'Save it as a recipe. Next time you make the same product in a different size, you start from the recipe rather than from scratch.'],

  aside: 'Saved recipes are on the Maker plan. Free accounts can still make one label.'
},
{
  kind: 'download' as const,
  title: 'Download your print ready label',
  paragraphs: [
  'You get a preview at true size, so you can see the label as it will print. Check your product name, your address and your batch code, then download.',
  'Paid plans give you a PDF for home printing or a print shop, and an SVG if your printer asks for vector artwork. Pictograms stay at the required minimum size and the regulated text does not shrink below what the rules allow, whatever else you change.'],

  aside: 'Free accounts get a watermarked PNG, which is enough to check the wording.'
}];


export function HowItWorks() {
  usePageMeta({
    title: 'How it works',
    description:
    'Three steps: upload your fragrance supplier safety data sheet, enter your fragrance percentage and pack size, then download a print ready UK and EU CLP label as PDF or SVG.'
  });

  return (
    <>
      <PageHero
        eyebrow="How it works"
        title="From supplier PDF to printed label"
        intro="No compliance knowledge needed to follow this. If you can read the safety data sheet your supplier emailed you, you can make a label.">
        
        <Button to="/sign-up" size="lg" track={{ label: 'Make a label free', location: 'how_it_works_hero' }}>
          Make a label free
        </Button>
      </PageHero>

      <Section>
        <ol className="space-y-12">
          {detailedSteps.map((step, index) =>
          <li key={step.title} className="grid gap-5 sm:grid-cols-[56px_1fr] sm:gap-7">
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
              Every part of the label comes from something you gave us, so you can trace each line
              back to the safety data sheet or your recipe.
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

      <Section>
        <Eyebrow>Being straight with you</Eyebrow>
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
            body: 'Poison centre notification, a Cosmetic Product Safety Report, weights and measures rules and packaging duties are all separate. We only do the label.'
          }].
          map((card) =>
          <div key={card.title} className="rounded-2xl border border-paper-edge bg-white p-5">
              <h3 className="font-display text-[1.02rem] font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.body}</p>
            </div>
          )}
        </div>
      </Section>

      <CtaBand location="how_it_works_final" />
    </>);

}