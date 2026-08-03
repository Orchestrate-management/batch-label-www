import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckIcon } from 'lucide-react';
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
import { NOT_YET_BUILT } from '../content/availability';

/**
 * What a card may list.
 *
 * Only what genuinely differs between tiers, which is the SKU allowance and nothing else.
 * Everything a label needs to be legally correct is on every tier including Free, so it is
 * stated once in the block below the ladder and never as a per-tier row — a row implies a
 * column where it is absent.
 *
 * Editor counts are absent on purpose. An account is one login today, so a "3 editors" row
 * would be a ceiling on a capability with no mechanism behind it. It goes in the
 * not-yet-built list instead.
 *
 * "Unlimited prints and reprints" was the third bullet and is gone for the same reason:
 * neither repo has a print path — no window.print, no @media print stylesheet, no raster or
 * vector writer — so a reprint is not a thing a customer can do once, let alone unlimited
 * times. It also contradicted the section three screens further down that says the label can
 * only be read on screen. That leaves a card stating the SKU allowance twice, once as a count
 * and once in scents. It is thin, and it is the whole of what these plans currently differ by.
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

const CONSULTANT_DIFFERENCE =
'Consultant removes the SKU ceiling. Multi-client workspaces, bulk generation, CSV import and the API are what it is meant to add on top, and none of them are built yet, so today it differs from Studio by SKU count alone. That is the honest state of it, and it is why we would rather you started lower.';

/** The oversized figure on a card. The tax qualifier sits inside the same element on purpose. */
function PlanPrice({ pence, interval }: {pence: number | null;interval: BillingInterval;}) {
  if (pence === null) {
    return (
      <p className="mt-5 font-display text-[2.2rem] font-semibold leading-none text-ink">
        {gbpNumeral(0)}
        <span className="ml-1 font-sans text-sm font-normal text-ink-muted">for ever</span>
      </p>);

  }
  return (
    <p className="mt-5 font-display text-[2.2rem] font-semibold leading-none text-ink">
      {gbpNumeral(pence)}
      <span className="ml-1 font-sans text-sm font-normal text-ink-muted">
        {interval === 'monthly' ? 'per month' : 'per year'} exc VAT
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

        <div
          className="mb-7 inline-flex rounded-xl border border-paper-edge bg-white p-1"
          role="group"
          aria-label="Billing period, prices exclude VAT">
          {(['annual', 'monthly'] as BillingInterval[]).map((option) =>
          <button
            key={option}
            type="button"
            aria-pressed={interval === option}
            onClick={() => setInterval(option)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            interval === option ? 'bg-teal-700 text-white' : 'text-ink-soft hover:text-ink'}`
            }>

              {option === 'monthly' ? 'Monthly' : 'Yearly, two months free'}
            </button>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LADDER.map((slug) => {
            const plan = PLANS[slug] as PlanDisplay;
            const pence = priceForInterval(plan, interval);
            const isFree = plan.slug === 'free';
            return (
              <div
                key={plan.slug}
                className={`rounded-2xl bg-white p-6 ${
                plan.slug === 'maker' ? 'border-2 border-teal-700' : 'border border-paper-edge'}`
                }>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-ink">{plan.label}</h3>
                  <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
                    {skuAllowance(plan)}
                  </span>
                </div>

                <PlanPrice pence={pence} interval={interval} />
                <p className="mt-1 text-sm text-ink-muted">
                  {isFree ?
                  'No card needed. Free is permanent, not a trial.' :
                  `VAT is added at checkout based on where you are. Cancel any time, ${
                  interval === 'monthly' ? 'monthly rolling' : 'and your plan runs to the end of the year you paid for'
                  }.`}
                </p>

                {isFree ?
                <Button
                  to="/sign-up"
                  variant="secondary"
                  fullWidth
                  className="mt-6"
                  track={{ label: `${plan.label} plan`, location: `pricing_${plan.slug}` }}>

                    Start free
                  </Button> :

                <Button
                  variant={plan.slug === 'maker' ? 'primary' : 'secondary'}
                  fullWidth
                  className="mt-6"
                  onClick={handleChoose}
                  track={{ label: `${plan.label} plan`, location: `pricing_${plan.slug}` }}>

                    {signedOut ? `Sign up to get ${plan.label}` : `Get ${plan.label}`}
                  </Button>
                }

                <ul className="mt-6 space-y-2.5">
                  {differentiators(plan).map((feature) =>
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-soft">
                      <CheckIcon size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  )}
                </ul>
              </div>);

          })}
        </div>

        {signedOut ?
        <p className="mt-4 text-sm text-ink-muted">
            You will make an account first, then choose your plan inside Batchlabel.
          </p> :
        null}

        <p id="what-is-a-sku" className="mt-8 max-w-prose scroll-mt-24 text-sm leading-relaxed text-ink-soft">
          <strong className="font-semibold text-ink">{SKU_DEFINITION}</strong> Most makers get about
          three SKUs out of one formulation, so {PLANS.maker.label} is roughly{' '}
          {approximateScents(PLANS.maker)} scents. Reading supplier safety data sheets is never
          counted, on any plan.
        </p>
      </Section>

      <Section className="bg-white" ariaLabelledBy="consultant-heading">
        <div className="rounded-2xl border border-paper-edge bg-paper p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Eyebrow>For people who label other people's products</Eyebrow>
              <Heading id="consultant-heading" level={2} className="text-[1.4rem] sm:text-[1.7rem]">
                {CONSULTANT.label}
              </Heading>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
              {skuAllowance(CONSULTANT)}
            </span>
          </div>

          <PlanPrice pence={priceForInterval(CONSULTANT, interval)} interval={interval} />
          <p className="mt-1 text-sm text-ink-muted">
            VAT is added at checkout based on where you are. Cancel any time.
          </p>

          <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
            {CONSULTANT_DIFFERENCE}
          </p>

          <Button
            variant="secondary"
            className="mt-6"
            onClick={handleChoose}
            track={{ label: `${CONSULTANT.label} plan`, location: 'pricing_consultant' }}>

            {signedOut ? `Sign up to get ${CONSULTANT.label}` : `Get ${CONSULTANT.label}`}
          </Button>
        </div>
      </Section>

      <Section ariaLabelledBy="universal-heading">
        <Eyebrow>Why the plans look like this</Eyebrow>
        <Heading id="universal-heading">Every plan makes the same label</Heading>
        <div className="mt-5 max-w-prose space-y-4 text-[1rem] leading-relaxed text-ink-soft">
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
          <p>What the plans change is how many things you can sell.</p>
        </div>
      </Section>

      <Section className="bg-white" ariaLabelledBy="not-yet-heading">
        <Eyebrow>Not built yet</Eyebrow>
        <Heading id="not-yet-heading">What you cannot do today</Heading>
        <p className="mt-3 max-w-prose text-[1rem] leading-relaxed text-ink-soft">
          None of the following is available on any plan, including {CONSULTANT.label}. We would
          rather list them here than let you find out after paying.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {NOT_YET_BUILT.map((item) =>
          <div key={item.title} className="rounded-2xl border border-paper-edge bg-paper p-5">
              <h3 className="font-display text-[1.02rem] font-semibold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{item.body}</p>
            </div>
          )}
        </div>
      </Section>

      <Section ariaLabelledBy="pricing-legal-heading">
        <h2 id="pricing-legal-heading" className="sr-only">
          Prices, VAT and responsibility
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-ink-muted">
          All prices are in GBP and exclude VAT, and they are the same in every country. Stripe adds
          VAT at checkout according to where you are and your VAT number if you give one.
        </p>
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-muted">
          Batchlabel produces labels against published UK CLP and EU CLP requirements from the
          information you enter. We do not certify or approve labels, and responsibility for the
          final label rests with you as the seller.
        </p>
      </Section>

      <Section className="bg-white" ariaLabelledBy="pricing-faq-heading">
        <Eyebrow>Billing questions</Eyebrow>
        <Heading id="pricing-faq-heading">How the price is metered, VAT and cancelling</Heading>
        <div className="mt-7">
          <Accordion items={pricingFaqs} />
        </div>
      </Section>
    </>);

}
