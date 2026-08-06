import { Button } from '../ui/Button';
import { LabelPreview } from '../LabelPreview';
import { GUTTER } from '../ui/Section';
import { PLANS } from '../../lib/plans';

// The free allowance is read from the plan projection, never typed. "SKU" is deliberately
// not glossed here: the definition is stated once, on /pricing, and paraphrasing it in the
// hero is how a unit ends up meaning three different things.
const reassurances = [
`${PLANS.free.skus} SKUs free, no card`,
'Candles, wax melts, reed diffusers and room sprays',
'UK and EU CLP wording'];


/**
 * The hero.
 *
 * It used to be a two-column grid with the type on the left and the example label in a
 * box on the right, both the same width, both the same weight, sitting on a flat field.
 * Three things changed and none of them are the words.
 *
 * 1. The stock. A ruled ground with the paper grain over it, so the band reads as a sheet
 *    rather than a colour, and a hairline at the foot instead of a hard border.
 * 2. The column ratio. 1.08fr to 0.92fr with the label pulled up and tilted a degree, so
 *    the two halves are no longer a pair of equal rectangles. The label is the product;
 *    it should look like an object on the bench, not a screenshot in a slot.
 * 3. The reassurance list. It was three lines with tick icons, which is the most generic
 *    component on the web. It is now a ruled strip along the foot of the band with the
 *    items separated by hairlines, which is also what lets it run full width under both
 *    columns instead of hanging off the bottom of the left one.
 */
export function Hero() {
  return (
    <section className={`bl-ruled relative overflow-hidden ${GUTTER} pb-0 pt-14 sm:pt-20`}>
      {/* The grain sits over the rules rather than beside them, and a soft clay bloom
          lifts the top-left corner so the h1 is not sitting on dead paper. */}
      <div aria-hidden="true" className="bl-grain pointer-events-none absolute inset-0" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-16">
          <div>
            {/* Tracking is dialled back below sm so the line still fits a 375px phone in
                one row rather than wrapping inside its own pill. */}
            <p className="bl-rise bl-rise-1 mb-6 inline-flex items-center gap-2 rounded-full border border-teal-600/25 bg-teal-50 py-1.5 pl-2.5 pr-3.5 font-mono text-[0.6rem] font-medium uppercase tracking-[0.08em] text-teal-800 sm:text-[0.68rem] sm:tracking-[0.14em]">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-clay-500" />
              For small batch makers in the UK and EU
            </p>
            <h1 className="bl-rise bl-rise-2 font-display text-[2.25rem] font-semibold leading-[1.04] text-ink sm:text-[3.5rem] sm:leading-[1.02] lg:text-[3.85rem]">
              Correct CLP labels for candles, melts, diffusers and sprays.
            </h1>
            <p className="bl-rise bl-rise-3 mt-6 max-w-[46ch] text-[1.14rem] leading-[1.6] text-ink-soft">
              Upload the safety data sheet from your fragrance supplier, enter how much fragrance is
              in the product and how big the pack is, and get the exact wording, pictograms and
              minimum sizes your label needs.
            </p>
            {/* The second paragraph is the specific one, so it is set apart rather than
                stacked: a clay rule down its left edge marks it as the aside it is. */}
            <p className="bl-rise bl-rise-4 mt-5 max-w-[46ch] border-l-2 border-clay-500/40 pl-4 text-[0.98rem] leading-[1.6] text-ink-muted">
              A reed diffuser at 30 per cent fragrance and a candle at 8 per cent are two different
              labelling jobs. Batchlabel does both properly.
            </p>

            <div className="bl-rise bl-rise-5 mt-9 flex flex-col gap-3 sm:flex-row">
              <Button
                to="/sign-up"
                size="lg"
                track={{ label: 'Make a label free', location: 'home_hero' }}>

                Make a label free
              </Button>
              <Button
                to="/how-it-works"
                variant="secondary"
                size="lg"
                track={{ label: 'See how it works', location: 'home_hero' }}>

                See how it works
              </Button>
            </div>
          </div>

          {/* A degree of rotation, undone on hover. The brand pack forbids rotating the
              MARK; this is the example label, which is a photograph of a product in all
              but medium. */}
          <div className="bl-rise bl-rise-4 lg:pl-4">
            <div className="motion-safe:transition-transform motion-safe:duration-500 lg:rotate-[-0.9deg] lg:hover:rotate-0">
              <LabelPreview />
            </div>
          </div>
        </div>

        {/* The reassurances, as a ruled strip along the foot of the band. */}
        <ul className="bl-numbered bl-rise bl-rise-5 mt-14 grid divide-y divide-paper-edge border-t border-paper-edge sm:mt-16 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {reassurances.map((item) =>
          <li
            key={item}
            className="flex items-baseline gap-3 py-4 text-[0.92rem] leading-snug text-ink-soft sm:px-5 sm:py-5 sm:first:pl-0 sm:last:pr-0">

              <span
              aria-hidden="true"
              className="bl-num bl-figures font-mono text-[0.7rem] font-medium tracking-[0.1em] text-clay-600" />

              {item}
            </li>
          )}
        </ul>
      </div>
    </section>);

}
