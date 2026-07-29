import React, { useEffect, useState } from 'react';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { usePageMeta } from '../lib/seo';
import { trackViewPricing } from '../lib/analytics';
import { startCheckout, PRICES, type BillingInterval } from '../lib/billing';
import { useAuth } from '../lib/auth';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Eyebrow } from '../components/ui/Section';
import { Button } from '../components/ui/Button';
import { Accordion } from '../components/ui/Accordion';
import { Alert } from '../components/ui/Field';
import { pricingFaqs } from '../content/faqs';

const freeFeatures = [
{ label: '1 label', included: true },
{ label: 'Watermarked preview', included: true },
{ label: 'PNG download', included: true },
{ label: 'Community support', included: true },
{ label: 'Print ready PDF and SVG', included: false },
{ label: 'UFI generation', included: false },
{ label: 'Batch code fields', included: false },
{ label: 'Saved recipes', included: false }];


const makerFeatures = [
'Unlimited labels',
'Print ready PDF and SVG',
'No watermark',
'UFI generation, that is a Unique Formula Identifier',
'Batch code and date fields',
'Saved recipes you can edit and reuse',
'Email support from a human',
'Up to five people on the account'];


export function Pricing() {
  usePageMeta({
    title: 'Pricing, £14 a month or £140 a year',
    description:
    'Start free with one watermarked label. The Maker plan is £14 a month or £140 a year for unlimited print ready CLP labels, UFI generation and saved recipes. VAT included.'
  });

  const { user } = useAuth();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackViewPricing('/pricing');
  }, []);

  const handleCheckout = async () => {
    setBusy(true);
    setError(null);
    const result = await startCheckout(interval, { email: user?.email, userId: user?.id });
    if (result.error) setError(result.error);
    setBusy(false);
  };

  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Two plans. One of them is free."
        intro="Try a label before you pay for anything. When you want files you can actually send to a printer, the Maker plan is £14 a month." />
      

      <Section ariaLabelledBy="plans-heading">
        <h2 id="plans-heading" className="sr-only">
          Plans
        </h2>

        <div className="mb-7 inline-flex rounded-xl border border-paper-edge bg-white p-1" role="group" aria-label="Billing period">
          {(['monthly', 'annual'] as BillingInterval[]).map((option) =>
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

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-paper-edge bg-white p-6">
            <h3 className="font-display text-lg font-semibold text-ink">Free</h3>
            <p className="mt-1 text-sm text-ink-muted">To check we handle your fragrance properly.</p>
            <p className="mt-5 font-display text-[2.2rem] font-semibold leading-none text-ink">£0</p>
            <p className="mt-1 text-sm text-ink-muted">No card required for free.</p>

            <Button
              to="/sign-up"
              variant="secondary"
              fullWidth
              className="mt-6"
              track={{ label: 'Start free', location: 'pricing_free' }}>
              
              Make a label free
            </Button>

            <ul className="mt-6 space-y-2.5">
              {freeFeatures.map((feature) =>
              <li
                key={feature.label}
                className={`flex items-start gap-2.5 text-sm ${
                feature.included ? 'text-ink-soft' : 'text-ink-muted/70'}`
                }>
                
                  {feature.included ?
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" /> :

                <MinusIcon size={16} className="mt-0.5 shrink-0 text-ink-muted/60" aria-hidden="true" />
                }
                  <span>{feature.label}</span>
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-2xl border-2 border-teal-700 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">Maker</h3>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
                Most makers pick this
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">For everything you actually sell.</p>
            <p className="mt-5 font-display text-[2.2rem] font-semibold leading-none text-ink">
              £{PRICES[interval]}
              <span className="ml-1 font-sans text-sm font-normal text-ink-muted">
                {interval === 'monthly' ? 'per month' : 'per year'}
              </span>
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              VAT included. Cancel any time, {interval === 'monthly' ? 'monthly rolling' : 'refunded pro rata'}.
            </p>

            <Button
              fullWidth
              className="mt-6"
              disabled={busy}
              onClick={handleCheckout}
              track={{ label: `Maker plan ${interval}`, location: 'pricing_maker' }}>
              
              {busy ? 'Opening checkout...' : 'Get the Maker plan'}
            </Button>

            {error ?
            <div className="mt-4">
                <Alert tone="error">{error}</Alert>
              </div> :
            null}

            <ul className="mt-6 space-y-2.5">
              {makerFeatures.map((feature) =>
              <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-soft">
                  <CheckIcon size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
                  <span>{feature}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        <p className="mt-6 max-w-prose text-sm leading-relaxed text-ink-muted">
          Batchlabel produces labels against published UK CLP and EU CLP requirements from the
          information you enter. We do not certify or approve labels, and responsibility for the
          final label rests with you as the seller.
        </p>
      </Section>

      <Section className="bg-white" ariaLabelledBy="pricing-faq-heading">
        <Eyebrow>Billing questions</Eyebrow>
        <Heading id="pricing-faq-heading">VAT, cancelling and refunds</Heading>
        <div className="mt-7">
          <Accordion items={pricingFaqs} />
        </div>
      </Section>
    </>);

}