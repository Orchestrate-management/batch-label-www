import { CheckIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { LabelPreview } from '../LabelPreview';
import { PLANS } from '../../lib/plans';

// The free allowance is read from the plan projection, never typed. "SKU" is deliberately
// not glossed here: the definition is stated once, on /pricing, and paraphrasing it in the
// hero is how a unit ends up meaning three different things.
const reassurances = [
`${PLANS.free.skus} SKUs free, no card`,
'Candles, wax melts, reed diffusers and room sprays',
'UK and EU CLP wording'];


export function Hero() {
  return (
    <section className="bl-grain border-b border-paper-edge px-5 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-16">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14">
        <div>
          <p className="mb-4 inline-flex items-center rounded-full border border-teal-600/25 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
            For small batch makers in the UK and EU
          </p>
          <h1 className="font-display text-[2.1rem] font-semibold leading-[1.08] tracking-[-0.02em] text-ink sm:text-[3.1rem]">
            Correct CLP labels for your candles, in minutes.
          </h1>
          <p className="mt-4 max-w-prose text-[1.08rem] leading-relaxed text-ink-soft">
            Upload the safety data sheet from your fragrance supplier, enter how much fragrance is
            in the product and how big the pack is, and get the exact wording, pictograms and
            minimum sizes your label needs.
          </p>
          <p className="mt-3 max-w-prose text-[0.98rem] leading-relaxed text-ink-muted">
            Home fragrance is the only category we cover, and everything in Batchlabel is built
            around it.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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

          <ul className="mt-7 space-y-2">
            {reassurances.map((item) =>
            <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-teal-700" aria-hidden="true" />
                {item}
              </li>
            )}
          </ul>
        </div>

        <div className="lg:pl-2">
          <LabelPreview />
        </div>
      </div>
    </section>);

}