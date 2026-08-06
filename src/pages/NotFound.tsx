import { usePageMeta } from '../lib/seo';
import { Button } from '../components/ui/Button';

export function NotFound() {
  usePageMeta({
    title: 'Page not found',
    description: 'That page does not exist.',
    noIndex: true
  });

  return (
    <section className="bl-ruled relative overflow-hidden px-5 py-28 sm:px-6 sm:py-36">
      <div aria-hidden="true" className="bl-grain pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-xl text-center">
        <p className="bl-figures font-mono text-[0.72rem] font-medium uppercase tracking-[0.22em] text-clay-600">
          404
        </p>
        <h1 className="mt-5 font-display text-[2.1rem] font-semibold leading-[1.1] text-ink sm:text-[2.6rem]">
          We cannot find that page
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[1.05rem] leading-[1.65] text-ink-soft">
          The link may be old, or we may have moved something.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/" size="lg">
            Back to the home page
          </Button>
          <Button to="/contact" variant="secondary" size="lg">
            Tell us about the broken link
          </Button>
        </div>
      </div>
    </section>);

}
