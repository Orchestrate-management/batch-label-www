import React from 'react';
import { Pictogram } from './Pictogram';

interface LabelPreviewProps {
  /** Slightly smaller type and padding, for use inside cards. */
  compact?: boolean;
}

/**
 * A rendered example of the label Batchlabel produces. Illustrative only: the wording on
 * a real label depends on the safety data sheet and recipe you enter.
 */
export function LabelPreview({ compact = false }: LabelPreviewProps) {
  return (
    <figure className="m-0 w-full">
      <div
        className={`rounded-2xl border border-paper-edge bg-white shadow-[0_1px_0_rgba(27,37,35,0.04),0_18px_40px_-28px_rgba(27,37,35,0.35)] ${
        compact ? 'p-4' : 'p-5 sm:p-6'}`
        }>
        
        <div className="flex items-start justify-between gap-3 border-b border-dashed border-paper-edge pb-3">
          <div>
            <p className="font-display text-base font-semibold leading-tight text-ink sm:text-lg">
              Sea Salt and Sage
            </p>
            <p className="text-xs text-ink-muted">Scented soy candle, 180 g</p>
          </div>
          <p className="text-right text-[0.65rem] leading-tight text-ink-muted">
            Willow &amp; Wick
            <br />
            Leeds, LS7 3PB, UK
          </p>
        </div>

        <div className="flex items-center gap-3 py-3">
          <Pictogram kind="irritant" label="Exclamation mark hazard pictogram" size={compact ? 36 : 44} />
          <Pictogram kind="environment" label="Environment hazard pictogram" size={compact ? 36 : 44} />
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink">Warning</p>
        </div>

        <dl className="space-y-2 text-[0.7rem] leading-snug text-ink-soft sm:text-[0.74rem]">
          <div>
            <dt className="font-semibold text-ink">Hazard statements</dt>
            <dd className="m-0">
              H315 Causes skin irritation. H317 May cause an allergic skin reaction. H319 Causes
              serious eye irritation. H411 Toxic to aquatic life with long lasting effects.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Precautionary statements</dt>
            <dd className="m-0">
              P101 If medical advice is needed, have product container or label to hand. P102 Keep
              out of reach of children. P280 Wear protective gloves. P302+P352 IF ON SKIN: wash with
              plenty of water. P305+P351+P338 IF IN EYES: rinse cautiously with water for several
              minutes. P273 Avoid release to the environment. P501 Dispose of contents and container
              in accordance with local regulations.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">Contains</dt>
            <dd className="m-0">
              Linalool, Citronellol, Geraniol, Limonene, Coumarin. May produce an allergic reaction.
            </dd>
          </div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed border-paper-edge pt-3 text-[0.68rem] text-ink-muted">
          <span className="font-mono text-ink">UFI: 4W7C-P0Q9-T00J-VXRK</span>
          <span className="font-mono">Batch: 26-04-A</span>
          <span>Burn within sight. Keep away from draughts.</span>
        </div>
      </div>
      <figcaption className="mt-3 text-xs text-ink-muted">
        Example output. Your wording comes from your supplier safety data sheet and the recipe you
        enter.
      </figcaption>
    </figure>);

}