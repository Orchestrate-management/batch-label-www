import { usePageMeta } from '../../lib/seo';
import { Button } from '../../components/ui/Button';

export function CheckoutCancelled() {
  usePageMeta({
    title: 'Checkout cancelled',
    description: 'You have not been charged. Your free label is still available.',
    noIndex: true
  });

  return (
    <section className="px-5 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-xl text-center">
        <h1 className="font-display text-[1.8rem] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[2.1rem]">
          No payment taken
        </h1>
        <p className="mx-auto mt-3 max-w-prose text-[1.02rem] leading-relaxed text-ink-soft">
          You closed the checkout, so nothing has been charged. Your free label is still there
          whenever you want it.
        </p>
        <p className="mx-auto mt-3 max-w-prose text-[0.97rem] leading-relaxed text-ink-muted">
          If something on the pricing page was unclear, tell us. We would rather answer a question
          than take money from someone who is unsure.
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/pricing" size="lg" track={{ label: 'Back to pricing', location: 'checkout_cancelled' }}>
            Back to pricing
          </Button>
          <Button to="/contact" variant="secondary" size="lg">
            Ask us a question
          </Button>
        </div>
      </div>
    </section>);

}