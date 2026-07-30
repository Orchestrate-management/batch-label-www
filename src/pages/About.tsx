import React from 'react';
import { usePageMeta } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow, Lead } from '../components/ui/Section';
import { CtaBand } from '../components/CtaBand';
import { verticals, type Vertical } from '../content/verticals';

const statusStyles: Record<Vertical['status'], string> = {
  'live': 'border-teal-600/25 bg-teal-50 text-teal-800',
  'interest': 'border-clay-500/25 bg-clay-100 text-clay-600',
  'idea': 'border-paper-edge bg-paper text-ink-muted'
};

export function About() {
  usePageMeta({
    title: 'About us',
    description:
    'Batchlabel started with a candle business and a very long evening reading a safety data sheet. We make CLP labels for candles, wax melts and diffusers, and we are straight about what the tool does not do.'
  });

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
            right size on a label. A soap maker or a skincare brand runs into a version of the same
            problem.
          </p>
          <p>
            Batchlabel is the first product from Orchestrate. We would like to take on more
            categories one day, and cosmetics is the one makers ask us for most. We have not started
            it. We are not going to give you a date, and you will not find a countdown anywhere on
            this site. Candles is what works, and it stays the priority.
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

      <Section className="bg-white" ariaLabelledBy="ladder-heading">
        <Eyebrow>Categories</Eyebrow>
        <Heading id="ladder-heading">Where things actually stand</Heading>
        <Lead className="mt-3">
          We would rather do one category properly than ten badly.
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
            body: 'You will never see us claim a label is guaranteed anything. We show our workings instead.'
          },
          {
            title: 'Fair price',
            body: 'One price, £14 a month. No tiers that punish you for growing.'
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
