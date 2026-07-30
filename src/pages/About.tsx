import React from 'react';
import { usePageMeta } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow, Lead } from '../components/ui/Section';
import { CtaBand } from '../components/CtaBand';
import { verticals, type Vertical } from '../content/verticals';

const statusStyles: Record<Vertical['status'], string> = {
  'live': 'border-teal-600/25 bg-teal-50 text-teal-800',
  'coming-soon': 'border-clay-500/25 bg-clay-100 text-clay-600',
  'planned': 'border-paper-edge bg-paper text-ink-muted'
};

export function About() {
  usePageMeta({
    title: 'About us',
    description:
    'Batchlabel is the first product from Orchestrate, making compliance labelling manageable for small batch makers. Candles and home fragrance today, cosmetics next, wider categories later. Honest about what the tool does and does not do.'
  });

  return (
    <>
      <PageHero
        eyebrow="About"
        title="Built by people who have printed the wrong label"
        intro="Batchlabel is a small UK company on a straightforward mission: take the compliance labelling that trips up small makers and make it quick and correct. We started with candles because that is where the pain was sharpest. We are not a compliance firm and we are not pretending to be one." />


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
            right size on a label. That problem is not unique to candles. A soap maker, a skincare
            brand, anyone selling a physical product runs into a version of it. So the tool we built
            for candles is really a compliance labelling platform that happens to have started with
            candles.
          </p>
          <p>
            Batchlabel is the first product from Orchestrate, the company behind it. The plan is to
            open the same engine up one category at a time, carefully, keeping candles first class
            while we go. Cosmetics is next, built with makers who already trust us for their candle
            labels. Wider consumer goods and, further out, technical products like electronics follow
            from there.
          </p>
          <p>
            We are based in the UK and we work with UK CLP and EU CLP, the rules on Classification,
            Labelling and Packaging, with more regulatory frames added as each category arrives. We
            read the published requirements and turn them into a label from the information you give
            us. We do not approve labels, we do not certify anything, and we will tell you when a
            product is beyond what we handle rather than take your money. That scope stays the same
            whatever the category: labelling, done properly, and nothing we cannot stand behind.
          </p>
          <p>
            There is no sales team. If you email us, one of us replies, usually the same day and
            always as a person.
          </p>
        </div>
      </Section>

      <Section className="bg-white" ariaLabelledBy="ladder-heading">
        <Eyebrow>The plan</Eyebrow>
        <Heading id="ladder-heading">The categories, and the order we are taking them in</Heading>
        <Lead className="mt-3">
          We would rather do one category properly than ten badly. Here is where things stand and
          where they are going.
        </Lead>

        <ol className="mt-8 space-y-3">
          {verticals.map((vertical) =>
          <li
            key={vertical.id}
            className="flex flex-col gap-2 rounded-2xl border border-paper-edge bg-paper p-5 sm:flex-row sm:items-start sm:gap-5">

              <span
              className={`inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              statusStyles[vertical.status]}`
              }>

                {vertical.statusLabel}
              </span>
              <div>
                <h3 className="font-display text-[1.05rem] font-semibold text-ink">{vertical.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{vertical.description}</p>
              </div>
            </li>
          )}
        </ol>
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
            body: 'You will never see us claim a label is guaranteed anything, in any category. We show our workings instead.'
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
