import { Section, Heading, Eyebrow, Lead } from '../ui/Section';
import { StepIllustration } from '../StepIllustration';
import { Button } from '../ui/Button';

export const steps = [
{
  kind: 'upload' as const,
  title: 'Upload your supplier safety data sheet',
  body: 'Drop in the PDF your fragrance oil supplier gave you. We read the classification, the hazard statements and the allergens out of it.'
},
{
  kind: 'recipe' as const,
  title: 'Enter your fragrance percentage and pack size',
  body: 'Tell us how much fragrance is in the product and how big the pack is. The classification follows the load in the finished product, and working that out is the part we do for you.'
},
{
  kind: 'download' as const,
  title: 'Check it at true size, then download it',
  body: 'The preview is at true size, so you see the label as it will print. Pictograms and minimum text sizes are set for you. Take it away as a print-ready PDF or an SVG.'
}];


/**
 * Three steps on card white.
 *
 * The sequence is the thing being communicated, and the old layout — three equal columns
 * with a small icon and a "STEP 1" caption above each — did not have one. There is a
 * hairline running through the step numbers now, so the row reads left to right as a
 * process, and the numerals are set large in the display face rather than as 12px caps.
 */
export function HowItWorksSteps({ withCta = true }: {withCta?: boolean;}) {
  return (
    <Section id="how-it-works" className="bg-white" ariaLabelledBy="how-heading" width="wide">
      <div className="max-w-2xl">
        <Eyebrow>Three steps</Eyebrow>
        <Heading id="how-heading">How Batchlabel works</Heading>
        <Lead className="mt-4">
          About ten minutes the first time, a couple of minutes after that.
        </Lead>
      </div>

      <ol className="bl-numbered mt-14 grid gap-12 sm:grid-cols-3 sm:gap-8">
        {steps.map((step, index) =>
        <li key={step.title} className="relative">
            {/* The connecting rule. Drawn per item and hidden on the last one, so it
                never runs past the end of the sequence. */}
            {index < steps.length - 1 ?
          <span
            aria-hidden="true"
            className="absolute left-[3.25rem] right-0 top-[1.6rem] hidden h-px bg-paper-edge sm:block" /> :

          null}

            {/* The numeral is generated, not written: "Step 1" is already said in words
                below it, so the disc is a mark rather than a second label. */}
            <span
            aria-hidden="true"
            className="bl-num-plain bl-figures relative z-10 flex h-[3.2rem] w-[3.2rem] shrink-0 items-center justify-center rounded-full border border-paper-edge bg-paper font-display text-[1.35rem] font-semibold text-teal-700" />

            <div className="mt-7">
              <StepIllustration kind={step.kind} size={88} />
            </div>

            <p className="mt-6 font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-clay-600">
              Step {index + 1}
            </p>
            <h3 className="mt-2 max-w-[26ch] font-display text-[1.18rem] font-semibold leading-snug text-ink">
              {step.title}
            </h3>
            <p className="mt-2.5 text-[0.97rem] leading-[1.65] text-ink-soft">{step.body}</p>
          </li>
        )}
      </ol>

      {withCta ?
      <div className="mt-14">
          <Button to="/sign-up" size="lg" track={{ label: 'Make a label free', location: 'home_how_it_works' }}>
            Make a label free
          </Button>
        </div> :
      null}
    </Section>);

}
