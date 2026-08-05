import { usePageMeta, useStructuredData } from '../lib/seo';
import { breadcrumbSchema, graph } from '../lib/structured-data';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow, Lead } from '../components/ui/Section';
import { CtaBand } from '../components/CtaBand';
import { productForms } from '../content/product-forms';

export function About() {
  usePageMeta({
    title: 'About us, CLP labelling for small makers',
    description:
    'Batchlabel started with a candle business and a long evening reading a safety data sheet. We make CLP labels for candles, and we are straight about the limits.'
  });

  useStructuredData(graph([breadcrumbSchema('About', '/about')]));

  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built by people who have printed the wrong label"
        intro="We are a small UK company. We make the labelling part of selling candles quicker to get right. We are not a compliance firm and we do not pretend to be one." />


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
            Somewhere along the way we noticed the hard part was never the candle. It was turning the
            data behind a product into the exact words a regulation demands, then setting them at the
            right size on a label. A wax melt maker and a room spray maker run into a version of the
            same problem.
          </p>
          <p>
            Batchlabel is the first product from Orchestrate. Home fragrance is what it does, it is
            what works, and it stays the priority. You will not find a roadmap countdown anywhere on
            this site.
          </p>
          <p>
            We are based in the UK and we work with UK CLP and EU CLP, the rules on Classification,
            Labelling and Packaging. We read the published requirements and turn them into a label
            from the information you give us. We do not approve labels, we do not certify anything,
            and we will tell you when a product is beyond what we handle rather than take your money.
          </p>
          <p>
            There is no sales team. If you email us, one of us replies, usually the same day.
          </p>
        </div>
      </Section>

      <Section className="bg-white" ariaLabelledBy="scope-heading">
        <Eyebrow>What we cover</Eyebrow>
        <Heading id="scope-heading">Four things, done properly</Heading>
        <Lead className="mt-3">
          We would rather do one category properly than ten badly. This is the whole of it.
        </Lead>

        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {productForms.map((form) =>
          <li
            key={form.id}
            className="rounded-2xl border border-paper-edge bg-paper p-5">

              <h3 className="font-display text-[1.05rem] font-semibold text-ink">{form.name}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{form.what}</p>
            </li>
          )}
        </ul>
      </Section>

      <Section ariaLabelledBy="values-heading">
        <Heading id="values-heading">What we care about</Heading>
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
            body: 'The cheapest plan is free and it makes the same label as the most expensive one. You are never charged for fixing a mistake or for reading another supplier safety data sheet, only for how many things you sell.'
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
