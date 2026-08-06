import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta, useStructuredData } from '../lib/seo';
import {
  breadcrumbSchema,
  faqPageSchema,
  graph,
  softwareApplicationSchema } from
'../lib/structured-data';
import { trackViewPricing } from '../lib/analytics';
import {
  CONSULTANT,
  LADDER,
  PLANS,
  SKU_DEFINITION,
  approximateScents,
  gbpNumeral,
  priceBare,
  priceForInterval,
  priceWithInterval,
  skuAllowance,
  type BillingInterval,
  type PlanDisplay } from
'../lib/plans';
import { useAuth } from '../lib/auth';
import { APP_URL } from '../lib/app-handoff';
import { clearCheckoutIntent, readCheckoutIntent, saveCheckoutIntent } from '../lib/checkout-intent';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Accordion } from '../components/ui/Accordion';
import { pricingFaqs } from '../content/faqs';

/**
 * What a card may list.
 *
 * Only what genuinely differs between tiers, which is the SKU allowance and nothing else.
 * Everything a label needs to be legally correct is on every tier including Free, so it is
 * stated once in the block below the ladder and never as a per-tier row — a row implies a
 * column where it is absent.
 *
 * Editor counts are absent on purpose. An account is one login, so a "3 editors" row would
 * be a ceiling on a capability with no mechanism behind it, and the seat count is one of
 * the four claims src/content/copy-honesty.test.ts still refuses to let onto the site.
 *
 * That leaves a card stating the SKU allowance twice, once as a count and once in scents.
 * It is thin, and it is the whole of what these plans differ by.
 */
function differentiators(plan: PlanDisplay): string[] {
  const scents = approximateScents(plan);
  return [
  skuAllowance(plan),
  scents === null ?
  'However many scents you sell' :
  scents === 1 ?
  'One scent in three pack sizes' :
  `About ${scents} scents, at three pack sizes each`];

}

/**
 * WHAT A PLAN INCLUDES IS NOT A FORWARD-LOOKING CLAIM.
 *
 * The rest of this site describes the finished product, deliberately. This
 * sentence cannot, because it is the only stated reason to pay £164 a month more
 * than Studio, and Terms section 6 says in the same deploy that a workspace per
 * client, bulk generation, CSV import and the API are not sold on any plan.
 *
 * In the plan contract, Consultant differs from Studio by exactly two numbers:
 * skuLimit UNLIMITED against 180, and editorSeatLimit 10 against 3. So that is
 * what the difference sentence says. Everything else the tier will eventually
 * carry is described where it costs nothing to be early — on How it works, on
 * every plan, as the product it is becoming.
 */
const CONSULTANT_DIFFERENCE =
'Consultant takes the SKU ceiling off, so a range of any size fits, and raises the workspace to ten editors. If you sell your own range rather than labelling for other people, Studio is the one to start on.';

/**
 * The oversized figure on a card.
 *
 * The tax qualifier sits inside the same element on purpose, and pages.seo.test.tsx
 * asserts it: every leaf node carrying a £ figure must have a parent whose text also
 * carries "exc VAT" or "for ever". The numeral is its own span so it can take tabular
 * figures without the qualifier going monospaced with it.
 */
function PlanPrice({
  pence,
  interval,
  tone = 'light'
}: {pence: number | null;interval: BillingInterval;tone?: 'light' | 'reversed';}) {
  const figure = tone === 'reversed' ? 'text-white' : 'text-ink';
  const qualifier = tone === 'reversed' ? 'text-teal-100' : 'text-ink-muted';
  return (
    <p className={`mt-6 flex flex-wrap items-baseline gap-x-2 font-display ${figure}`}>
      <span className="bl-figures text-[2.7rem] font-semibold leading-none tracking-[-0.02em]">
        {pence === null ? gbpNumeral(0) : gbpNumeral(pence)}
      </span>
      <span className={`font-sans text-[0.85rem] font-normal ${qualifier}`}>
        {pence === null ?
        'for ever' :
        `${interval === 'monthly' ? 'per month' : 'per year'} exc VAT`}
      </span>
    </p>);

}

export function Pricing() {
  usePageMeta({
    title: `Pricing, from ${priceWithInterval(PLANS.maker.monthlyPence, 'monthly')}`,
    description: `Start free with ${PLANS.free.skus} SKUs and the same CLP label wording every paid plan produces. Paid plans run from ${priceBare(PLANS.maker.monthlyPence)} a month and are metered by SKU.`
  });

  // Restored after a semantic merge conflict: #12 added this and #13 edited the same
  // component, so the textual merge kept the imports and dropped the call. The page then
  // shipped with no Offer or FAQ markup while still looking instrumented.
  useStructuredData(
    graph([
    breadcrumbSchema('Pricing', '/pricing'),
    softwareApplicationSchema(),
    faqPageSchema('/pricing', pricingFaqs)])
  );

  const navigate = useNavigate();
  const { session, configured } = useAuth();
  // Annual first, and selected. Two months free is the better deal and the founder's
  // decision is that it is the one we lead with.
  const [interval, setInterval] = useState<BillingInterval>('annual');

  useEffect(() => {
    trackViewPricing('/pricing');
  }, []);

  // Coming back from signing up: put the toggle back where they left it, so the maker who
  // chose annual before being interrupted is not silently shown monthly.
  useEffect(() => {
    if (!session) return;
    const remembered = readCheckoutIntent();
    if (remembered) {
      setInterval(remembered);
      clearCheckoutIntent();
    }
  }, [session]);

  const signedOut = configured && !session;

  /**
   * www no longer opens a Checkout session. The tier is chosen on the billing page inside
   * the app, which is the one place that knows which plan the customer is already on — and
   * with four tiers a button that quietly bought a fixed one was a wrong-plan purchase
   * waiting to happen. Signed out, we remember the interval and send them to sign up.
   */
  const handleChoose = () => {
    if (signedOut) {
      saveCheckoutIntent(interval);
      navigate('/sign-up', { state: { from: '/pricing' } });
      return;
    }
    window.location.assign(APP_URL);
  };

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Start free. Move up when you have more to sell."
        intro={`Make ${PLANS.free.skus} SKUs free, with the same label wording every paid plan produces and no card. When you have more than that to sell, Maker is ${priceWithInterval(PLANS.maker.monthlyPence, 'monthly')} for ${PLANS.maker.skus} SKUs.`} />


      <Section ariaLabelledBy="plans-heading">
        <h2 id="plans-heading" className="sr-only">
          Plans
        </h2>

        {/*
          The billing toggle. It was two 32px pills in a bordered box, which is small for
          the control that changes every figure on the page. It is a proper segmented
          switch now, with the saving stated on the option that carries it.
         */}
        <div
          className="mb-10 inline-flex rounded-2xl border border-paper-edge bg-white p-1 shadow-card"
          role="group"
          aria-label="Billing period, prices exclude VAT">
          {(['annual', 'monthly'] as BillingInterval[]).map((option) =>
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => setInterval(option)}
            className={`min-h-[2.75rem] rounded-xl px-5 text-[0.92rem] font-medium transition-colors ${
            interval === option ?
            'bg-teal-700 text-white shadow-[0_8px_18px_-12px_rgba(15,61,59,0.9)]' :
            'text-ink-soft hover:bg-paper-deep hover:text-ink'}`
            }>

              {option === 'monthly' ? 'Monthly' : 'Yearly, two months free'}
            </button>
          )}
        </div>

        {/*
          THE LADDER, AS SWING TAGS.

          The mark is a punched swing tag and a plan is a thing you hang on a product, so
          the cards take that silhouette: the top-left corner cut, a punch hole in the cut.
          Maker is reversed out in the deepest teal rather than merely outlined in it,
          because a 2px border is not enough to carry "this is the one most people want"
          against two cards of identical size. .bl-reversed swaps the focus ring to paper
          so keyboard focus stays visible on the dark tag.
         */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {LADDER.map((slug) => {
            const plan = PLANS[slug] as PlanDisplay;
            const pence = priceForInterval(plan, interval);
            const isFree = plan.slug === 'free';
            const lead = plan.slug === 'maker';
            return (
              <div
                key={plan.slug}
                className={`bl-tag bl-hover-lift flex flex-col p-7 sm:p-8 ${
                lead ?
                'bl-reversed bg-gradient-to-b from-teal-900 to-teal-800 text-white shadow-lift' :
                'border border-paper-edge bg-white shadow-card hover:border-ink-line/50'}`
                }>

                <div className="flex items-center justify-between gap-3">
                  <h3
                    className={`font-display text-[1.3rem] font-semibold ${
                    lead ? 'text-white' : 'text-ink'}`
                    }>

                    {plan.label}
                  </h3>
                  <span
                    className={`bl-figures rounded-full px-3 py-1 font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em] ${
                    lead ? 'bg-white/15 text-teal-100' : 'bg-teal-50 text-teal-800'}`
                    }>

                    {skuAllowance(plan)}
                  </span>
                </div>

                <PlanPrice pence={pence} interval={interval} tone={lead ? 'reversed' : 'light'} />

                <p
                  className={`mt-3 text-[0.86rem] leading-[1.6] ${
                  lead ? 'text-teal-100' : 'text-ink-muted'}`
                  }>

                  {isFree ?
                  'No card needed. Free is permanent, not a trial.' :
                  `VAT is added at checkout based on where you are. Cancel any time, ${
                  interval === 'monthly' ? 'monthly rolling' : 'and your plan runs to the end of the year you paid for'
                  }.`}
                </p>

                <ul
                  className={`mt-7 space-y-0 divide-y ${
                  lead ? 'divide-white/15 border-y border-white/15' : 'divide-paper-edge border-y border-paper-edge'}`
                  }>

                  {differentiators(plan).map((feature) =>
                  <li
                    key={feature}
                    className={`flex items-baseline gap-3 py-3 text-[0.92rem] leading-snug ${
                    lead ? 'text-teal-100' : 'text-ink-soft'}`
                    }>

                      <span
                      aria-hidden="true"
                      className={`h-1 w-1 shrink-0 rotate-45 ${lead ? 'bg-clay-300' : 'bg-clay-500'}`} />

                      <span>{feature}</span>
                    </li>
                  )}
                </ul>

                <div className="mt-auto pt-7">
                  {isFree ?
                  <Button
                    to="/sign-up"
                    variant="secondary"
                    fullWidth
                    track={{ label: `${plan.label} plan`, location: `pricing_${plan.slug}` }}>

                      Start free
                    </Button> :

                  <Button
                    variant={lead ? 'primary' : 'secondary'}
                    fullWidth
                    className={
                    lead ? 'bg-white text-teal-800 shadow-none hover:bg-paper-deep' : undefined
                    }
                    onClick={handleChoose}
                    track={{ label: `${plan.label} plan`, location: `pricing_${plan.slug}` }}>

                      {signedOut ? `Sign up to get ${plan.label}` : `Get ${plan.label}`}
                    </Button>
                  }
                </div>
              </div>);

          })}
        </div>

        {signedOut ?
        <p className="mt-6 text-[0.9rem] text-ink-muted">
            You will make an account first, then choose your plan inside Batchlabel.
          </p> :
        null}

        {/* The unit definition. It is the single most consulted sentence on this page —
            /pricing#what-is-a-sku is linked from the FAQ and from the app — so it is set
            as an inset note against the clay rule rather than as another grey paragraph. */}
        <p
          id="what-is-a-sku"
          className="mt-12 max-w-prose scroll-mt-28 border-l-2 border-clay-500 bg-paper-deep py-4 pl-5 pr-4 text-[0.95rem] leading-[1.7] text-ink-soft">

          <strong className="font-semibold text-ink">{SKU_DEFINITION}</strong> Most makers get about
          three SKUs out of one formulation, so {PLANS.maker.label} is roughly{' '}
          {approximateScents(PLANS.maker)} scents. Reading supplier safety data sheets is never
          counted, on any plan.
        </p>
      </Section>

      <Section className="bg-white" ariaLabelledBy="consultant-heading">
        <div className="bl-tag border border-paper-edge bg-paper p-7 shadow-card sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-start lg:gap-14">
            <div>
              <Eyebrow>For people who label other people's products</Eyebrow>
              <Heading id="consultant-heading" level={2} className="text-[1.55rem] sm:text-[1.9rem]">
                {CONSULTANT.label}
              </Heading>
              <p className="mt-5 max-w-prose text-[0.98rem] leading-[1.7] text-ink-soft">
                {CONSULTANT_DIFFERENCE}
              </p>
            </div>

            <div className="border-t border-paper-edge pt-6 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-1">
              <span className="bl-figures inline-flex rounded-full bg-teal-50 px-3 py-1 font-mono text-[0.68rem] font-medium uppercase tracking-[0.08em] text-teal-800">
                {skuAllowance(CONSULTANT)}
              </span>
              <PlanPrice pence={priceForInterval(CONSULTANT, interval)} interval={interval} />
              <p className="mt-3 text-[0.86rem] leading-[1.6] text-ink-muted">
                VAT is added at checkout based on where you are. Cancel any time.
              </p>
              <Button
                variant="secondary"
                fullWidth
                className="mt-7"
                onClick={handleChoose}
                track={{ label: `${CONSULTANT.label} plan`, location: 'pricing_consultant' }}>

                {signedOut ? `Sign up to get ${CONSULTANT.label}` : `Get ${CONSULTANT.label}`}
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section ariaLabelledBy="universal-heading">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>Why the plans look like this</Eyebrow>
            <Heading id="universal-heading">Every plan makes the same label</Heading>
          </div>
          <div className="max-w-prose space-y-5 text-[1.02rem] leading-[1.75] text-ink-soft">
            <p>
              The label a free account builds is the label a {CONSULTANT.label} account builds. Same
              hazard statements, same precautionary statements, same signal word, same pictograms at
              the sizes CLP Annex I sets, same allergen declarations. Nothing that makes a label
              legally correct sits behind a price.
            </p>
            <p>
              If your fragrance supplier gives you free CLP labels, take them, right up until you buy
              from a second supplier, or run a load their calculator does not offer, or need a label
              for a blend you made yourself. Batchlabel reads any supplier's safety data sheet at any
              percentage you actually use, and reading them is never metered on any plan.
            </p>
            <p className="font-display text-[1.25rem] font-semibold leading-snug text-ink">
              What the plans change is how many things you can sell.
            </p>
          </div>
        </div>
      </Section>

      <Section className="bg-paper-shade" ariaLabelledBy="pricing-legal-heading">
        <h2 id="pricing-legal-heading" className="sr-only">
          Prices, VAT and responsibility
        </h2>
        <div className="grid gap-6 text-[0.88rem] leading-[1.75] text-ink-muted lg:grid-cols-2 lg:gap-14">
          <p>
            All prices are in GBP and exclude VAT, and they are the same in every country. Stripe adds
            VAT at checkout according to where you are and your VAT number if you give one.
          </p>
          <p>
            Batchlabel produces labels against published UK CLP and EU CLP requirements from the
            information you enter. We do not certify or approve labels, and responsibility for the
            final label rests with you as the seller.
          </p>
        </div>
      </Section>

      <Section ariaLabelledBy="pricing-faq-heading">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <Eyebrow>Billing questions</Eyebrow>
            <Heading id="pricing-faq-heading">How the price is metered, VAT and cancelling</Heading>
          </div>
          <Accordion items={pricingFaqs} />
        </div>
      </Section>
    </>);

}
