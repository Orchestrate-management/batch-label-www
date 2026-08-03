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
  // No saved recipe. Products live in an in-memory array in the app, so nothing survives a
  // reload, let alone gets reused for a second batch. The same claim was struck from three
  // other surfaces and survived here.
  body: 'Tell us how much fragrance is in the product and how big the pack is. The classification follows from the load, not from the neat oil, and that is the calculation we do for you.'
},
{
  kind: 'download' as const,
  title: 'Check your label at true size',
  body: 'The preview is at true size, so you see the label as it will print. Pictograms and minimum text sizes are set for you. Downloading it as a PDF or an SVG is still being built.'
}];


export function HowItWorksSteps({ withCta = true }: {withCta?: boolean;}) {
  return (
    <Section id="how-it-works" className="bg-white" ariaLabelledBy="how-heading">
      <Eyebrow>Three steps</Eyebrow>
      <Heading id="how-heading">How Batchlabel works</Heading>
      <Lead className="mt-3">
        About ten minutes the first time, a couple of minutes after that.
      </Lead>

      <ol className="mt-8 grid gap-6 sm:grid-cols-3">
        {steps.map((step, index) =>
        <li key={step.title}>
            <StepIllustration kind={step.kind} />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
              Step {index + 1}
            </p>
            <h3 className="mt-1 font-display text-[1.05rem] font-semibold leading-snug text-ink">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{step.body}</p>
          </li>
        )}
      </ol>

      {withCta ?
      <div className="mt-9">
          <Button to="/sign-up" track={{ label: 'Make a label free', location: 'home_how_it_works' }}>
            Make a label free
          </Button>
        </div> :
      null}
    </Section>);

}