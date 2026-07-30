import { usePageMeta } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section, Heading } from '../components/ui/Section';
import { CtaBand } from '../components/CtaBand';

export function About() {
  usePageMeta({
    title: 'About us',
    description:
    'Batchlabel is a small UK company making CLP labelling manageable for small batch candle, wax melt and diffuser makers. Honest about what the tool does and does not do.'
  });

  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built by people who have printed the wrong label"
        intro="Batchlabel is a small UK company. We are not a compliance firm and we are not pretending to be one." />
      

      <Section>
        <div className="max-w-prose space-y-5 text-[1.02rem] leading-relaxed text-ink-soft">
          <p>
            This started with a candle business, a kitchen table and a very long evening trying to
            work out which hazard statements belonged on a 180 g tin. The safety data sheet ran to
            eleven pages. The advice online contradicted itself. A consultant quoted more for one
            fragrance than the whole month had taken in sales.
          </p>
          <p>
            We built a spreadsheet, then a better spreadsheet, then something that did not fall over
            when the fragrance load changed. Other makers asked to use it. That became Batchlabel.
          </p>
          <p>
            We are based in the UK and we work with UK CLP and EU CLP, the rules on Classification,
            Labelling and Packaging. We read the published requirements and turn them into a label
            from the information you give us. We do not approve labels, we do not certify anything,
            and we will tell you when a product is beyond what we handle rather than take your money.
          </p>
          <p>
            There is no sales team. If you email us, one of us replies, usually the same day and
            always as a person.
          </p>
        </div>
      </Section>

      <Section className="bg-white">
        <Heading>What we care about</Heading>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
          {
            title: 'Plain words',
            body: 'If we cannot explain a rule without jargon, we have not understood it well enough yet.'
          },
          {
            title: 'Honest limits',
            body: 'You will never see us claim a label is guaranteed anything. We show our workings instead.'
          },
          {
            title: 'Fair price',
            body: 'One price, £14 a month. No tiers designed to catch you out as your shop grows.'
          }].
          map((card) =>
          <div key={card.title} className="rounded-2xl border border-paper-edge bg-paper p-5">
              <h3 className="font-display text-[1.02rem] font-semibold text-ink">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{card.body}</p>
            </div>
          )}
        </div>
      </Section>

      <CtaBand location="about_final" />
    </>);

}