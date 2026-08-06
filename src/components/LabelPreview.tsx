import { Pictogram } from './Pictogram';

interface LabelPreviewProps {
  /** Slightly smaller type and padding, for use inside cards. */
  compact?: boolean;
}

/**
 * A rendered example of the label Batchlabel produces. Illustrative only: the wording on
 * a real label depends on the safety data sheet and recipe you enter.
 *
 * THE POINT OF THE TREATMENT. This is the only picture of the product anywhere on the
 * site, and it used to be drawn as a rounded card, which is what every other box on the
 * page is. It now reads as a piece of printed stock: a perforated top and bottom edge,
 * corner registration ticks, a size caption set in the mono face and a hairline scale
 * down the left of the regulated text. None of it is decoration for its own sake — every
 * one of those marks is on a real sheet of labels, and the maker looking at this has held
 * one.
 */
export function LabelPreview({ compact = false }: LabelPreviewProps) {
  return (
    <figure className="bl-registered m-0 w-full">
      <div
        className={`bl-perf relative rounded-[0.5rem] border border-paper-edge bg-white shadow-tag ${
        compact ? 'p-4 sm:p-5' : 'p-5 sm:p-7'}`
        }>

        <div className="flex items-start justify-between gap-3 border-b border-dashed border-paper-edge pb-3">
          <div>
            <p className="font-display text-[1.05rem] font-semibold leading-tight text-ink sm:text-[1.2rem]">
              Sea Salt and Sage
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">Scented soy candle, 180 g</p>
          </div>
          <p className="text-right font-mono text-[0.62rem] leading-[1.5] text-ink-muted">
            Willow &amp; Wick
            <br />
            Leeds, LS7 3PB, UK
          </p>
        </div>

        <div className="flex items-center gap-3 py-3.5">
          <Pictogram kind="irritant" label="Exclamation mark hazard pictogram" size={compact ? 38 : 46} />
          <Pictogram kind="environment" label="Environment hazard pictogram" size={compact ? 38 : 46} />
          <p className="font-display text-[0.92rem] font-bold uppercase tracking-[0.08em] text-ink">
            Warning
          </p>
        </div>

        {/* The hairline down the left is the CLP text block, marked out the way a
            printer's proof marks the area that has a minimum size rule on it. */}
        <dl className="space-y-2.5 border-l-2 border-clay-500/35 pl-3 text-[0.71rem] leading-[1.5] text-ink-soft sm:text-[0.75rem]">
          <div>
            <dt className="font-semibold uppercase tracking-[0.06em] text-ink">Hazard statements</dt>
            <dd className="m-0 mt-0.5">
              H315 Causes skin irritation. H317 May cause an allergic skin reaction. H319 Causes
              serious eye irritation. H411 Toxic to aquatic life with long lasting effects.
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.06em] text-ink">
              Precautionary statements
            </dt>
            <dd className="m-0 mt-0.5">
              P101 If medical advice is needed, have product container or label to hand. P102 Keep
              out of reach of children. P280 Wear protective gloves. P302+P352 IF ON SKIN: wash with
              plenty of water. P305+P351+P338 IF IN EYES: rinse cautiously with water for several
              minutes. P273 Avoid release to the environment. P501 Dispose of contents and container
              in accordance with local regulations.
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-[0.06em] text-ink">Contains</dt>
            <dd className="m-0 mt-0.5">
              Linalool, Citronellol, Geraniol, Limonene, Coumarin. May produce an allergic reaction.
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-paper-edge pt-3 text-[0.68rem] text-ink-muted">
          <span className="bl-figures font-mono font-medium text-ink">UFI: 4W7C-P0Q9-T00J-VXRK</span>
          <span className="bl-figures font-mono">Batch: 26-04-A</span>
          <span>Burn within sight. Keep away from draughts.</span>
        </div>
      </div>
      <figcaption className="mt-5 max-w-sm text-xs leading-relaxed text-ink-muted">
        Example output. Your wording comes from your supplier safety data sheet and the recipe you
        enter.
      </figcaption>
    </figure>);

}
