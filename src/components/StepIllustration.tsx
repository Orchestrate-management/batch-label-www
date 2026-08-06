
type StepKind = 'upload' | 'recipe' | 'download';

interface StepIllustrationProps {
  kind: StepKind;
  /** Edge of the square plate, in px. */
  size?: number;
}

const STROKE = '#14514F';
const ACCENT = '#B4674A';

/**
 * Line illustrations for the three steps.
 *
 * They used to be 56px chips: a rounded teal-50 square with a small glyph inside, which
 * at that size read as an icon in a list. They are plates now — a ruled tint panel with a
 * drawing that actually shows the object the step is about, at a size where the drawing
 * is worth looking at. Still flat, still two colour, still no photography.
 */
export function StepIllustration({ kind, size = 96 }: StepIllustrationProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0">

      <defs>
        <pattern id={`bl-rule-${kind}`} width="96" height="8" patternUnits="userSpaceOnUse">
          <rect width="96" height="1" fill="#14514F" opacity="0.07" />
        </pattern>
      </defs>

      {/* The plate. A swing-tag silhouette: the top-left corner is cut and punched, the
          same shape the mark is drawn from. */}
      <path d="M20 2h68a6 6 0 0 1 6 6v80a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V20z" fill="#EAF1F0" />
      <path d="M20 2h68a6 6 0 0 1 6 6v80a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V20z" fill={`url(#bl-rule-${kind})`} />
      <circle cx="13" cy="13" r="3.4" fill="none" stroke={STROKE} strokeWidth="1.6" opacity="0.5" />

      {kind === 'upload' ?
      <g stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {/* A safety data sheet: a document with ruled lines and an arrow going in. */}
          <path d="M34 24h20l12 12v38a3 3 0 0 1-3 3H34a3 3 0 0 1-3-3V27a3 3 0 0 1 3-3z" fill="#FBF8F3" />
          <path d="M54 24v12h12" />
          <path d="M38 46h14M38 53h20M38 60h20" strokeWidth="1.8" opacity="0.55" />
          <path d="M48 84V68" stroke={ACCENT} />
          <path d="M42.5 73.5 48 68l5.5 5.5" stroke={ACCENT} />
        </g> :
      null}

      {kind === 'recipe' ?
      <g stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {/* A poured candle with a fill line: the percentage is the step. */}
          <path d="M35 30h26v6a20 20 0 0 1 6 14v24a4 4 0 0 1-4 4H33a4 4 0 0 1-4-4V50a20 20 0 0 1 6-14v-6z" fill="#FBF8F3" />
          <path d="M29 62h38" stroke={ACCENT} strokeWidth="2.6" />
          <path d="M48 30v-8" />
          <path d="M44.5 22h7" strokeWidth="1.8" opacity="0.6" />
          <path d="M71 62h8M71 74h8" stroke={ACCENT} strokeWidth="1.6" opacity="0.7" />
        </g> :
      null}

      {kind === 'download' ?
      <g stroke={STROKE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {/* The finished label, with the rule that measures it. */}
          <rect x="26" y="26" width="44" height="32" rx="3" fill="#FBF8F3" />
          <path d="M32 36h18M32 43h26M32 50h22" strokeWidth="1.8" opacity="0.55" />
          <path d="M26 66h44" stroke={ACCENT} strokeWidth="1.6" />
          <path d="M26 63v6M70 63v6M48 64v4" stroke={ACCENT} strokeWidth="1.6" />
          <path d="M48 88V76" stroke={ACCENT} />
          <path d="M42.5 82.5 48 88l5.5-5.5" stroke={ACCENT} />
        </g> :
      null}
    </svg>);

}
