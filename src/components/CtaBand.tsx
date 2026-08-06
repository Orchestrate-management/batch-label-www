import { Button } from './ui/Button';

interface CtaBandProps {
  heading?: string;
  body?: string;
  location: string;
}

/**
 * The closing band.
 *
 * Same teal, more depth: a gradient from teal-900 to teal-800 with the reversed grain
 * over it and a hairline of clay across the top, so the darkest thing on the page has an
 * edge rather than starting abruptly. The disclaimer under the buttons is separated by a
 * rule instead of just being smaller text, because it is a different kind of sentence
 * from the one above it and should not read as a third line of sell.
 */
export function CtaBand({
  heading = 'Make your first label tonight',
  body = 'Free, and no card needed. If it does not handle your fragrance properly, you have lost ten minutes.',
  location
}: CtaBandProps) {
  return (
    <section className="bl-reversed relative overflow-hidden bg-gradient-to-b from-teal-900 to-teal-800 px-5 py-20 sm:px-8 sm:py-24">
      <div aria-hidden="true" className="bl-grain-reversed pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-clay-300/40" />

      <div className="relative mx-auto w-full max-w-3xl text-center">
        <h2 className="font-display text-[1.95rem] font-semibold leading-[1.1] text-white sm:text-[2.6rem]">
          {heading}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[1.05rem] leading-[1.65] text-teal-100">{body}</p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            to="/sign-up"
            size="lg"
            className="bg-white text-teal-800 shadow-[0_1px_0_rgba(0,0,0,0.1),0_16px_30px_-18px_rgba(0,0,0,0.8)] hover:bg-paper-deep"
            track={{ label: 'Make a label free', location }}>

            Make a label free
          </Button>
          <Button
            to="/pricing"
            size="lg"
            variant="secondary"
            className="border-white/35 bg-transparent text-white shadow-none hover:border-white/70 hover:bg-white/10"
            track={{ label: 'See pricing', location }}>

            See pricing
          </Button>
        </div>
        <p className="mx-auto mt-10 max-w-xl border-t border-white/15 pt-5 text-[0.8rem] leading-relaxed text-teal-100">
          Batchlabel builds labels against published CLP requirements from the details you provide.
          The final label remains your responsibility as the seller.
        </p>
      </div>
    </section>);

}
