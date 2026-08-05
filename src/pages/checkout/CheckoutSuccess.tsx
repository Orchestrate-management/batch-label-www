import { useSearchParams } from 'react-router-dom';
import { CheckCircle2Icon } from 'lucide-react';
import { usePageMeta } from '../../lib/seo';
import { Button } from '../../components/ui/Button';
import { APP_URL } from '../../lib/app-handoff';

export function CheckoutSuccess() {
  usePageMeta({
    title: 'Payment received',
    description: 'Your Batchlabel plan is active.',
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
          Your plan is active
        </h1>
        <p className="mx-auto mt-3 max-w-prose text-[1.02rem] leading-relaxed text-ink-soft">
          Thank you. Your new SKU allowance is on your account page, and your VAT receipt is on its
          way by email from Stripe. Everything that goes on the label was already yours on the free
          plan and is unchanged.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {/*
            Back to the product, not to the account area. Someone who has just paid
            wants to export the thing they were blocked on. This used to send them to
            /dashboard, which greeted a paying customer with "No labels yet. Your
            first label is free."
           */}
          <Button href={APP_URL} size="lg" track={{ label: 'Open Batchlabel', location: 'checkout_success' }}>
            Back to my labels
          </Button>
          {/*
            Into the app, not to this site's account page — there is no longer one, and
            there should not be. This used to point at /dashboard/account, which is now a
            forwarding address; linking through it would be a redirect a customer could
            watch happen for no reason.
           */}
          <Button href={`${APP_URL}/billing`} variant="secondary" size="lg">
            Billing and invoices
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