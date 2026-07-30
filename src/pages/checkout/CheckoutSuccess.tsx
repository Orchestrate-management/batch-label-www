import { useSearchParams } from 'react-router-dom';
import { CheckCircle2Icon } from 'lucide-react';
import { usePageMeta } from '../../lib/seo';
import { Button } from '../../components/ui/Button';

export function CheckoutSuccess() {
  usePageMeta({
    title: 'Payment received',
    description: 'Your Batchlabel Maker plan is active.',
    noIndex: true
  });

  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <section className="px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-xl text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
          <CheckCircle2Icon size={24} className="text-teal-700" aria-hidden="true" />
        </div>
        <h1 className="mt-5 font-display text-[1.8rem] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[2.1rem]">
          You are on the Maker plan
        </h1>
        <p className="mx-auto mt-3 max-w-prose text-[1.02rem] leading-relaxed text-ink-soft">
          Thank you. Watermarks are off and print ready PDF and SVG downloads are switched on. Your
          VAT receipt is on its way by email from Stripe.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/dashboard" size="lg" track={{ label: 'Go to dashboard', location: 'checkout_success' }}>
            Go to my dashboard
          </Button>
          <Button to="/how-it-works" variant="secondary" size="lg">
            Read the three steps
          </Button>
        </div>

        {sessionId ?
        <p className="mt-6 break-all text-xs text-ink-muted">Reference: {sessionId}</p> :
        null}
        <p className="mt-4 text-xs text-ink-muted">
          {/* The purchase conversion is recorded server side from the Stripe webhook, not here,
               so refunds and failed payments cannot inflate it. See api/stripe-webhook.ts. */}
          Anything not right? Email hello@batchlabel.co.uk and we will fix it or refund you.
        </p>
      </div>
    </section>);

}