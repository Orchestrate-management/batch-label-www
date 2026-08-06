
/**
 * The four product forms, drawn.
 *
 * The forms section carried four paragraphs of text and nothing to look at, so a maker
 * scanning for "do you do diffusers" had to read to find out. These are the four objects,
 * flat and two colour like the step plates, and each one carries the accent on the part
 * of it the labelling actually turns on: the fill line on a candle, the reeds on a
 * diffuser, the nozzle on a spray.
 */
type FormKind = 'candles' | 'wax-melts' | 'reed-diffusers' | 'room-sprays';

const STROKE = '#14514F';
const ACCENT = '#B4674A';

export function ProductFormIcon({ id, size = 60 }: {id: string;size?: number;}) {
  const kind = id as FormKind;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className="shrink-0">

      <g stroke={STROKE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'candles' ?
        <>
            <path d="M16 26h32v28a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V26z" fill="#FBF8F3" />
            <path d="M14 26h36" />
            <path d="M32 26v-6" />
            <path d="M32 20c3-2 3-5 0-7-3 2-3 5 0 7z" fill="#FBF8F3" stroke={ACCENT} />
            <path d="M16 44h32" stroke={ACCENT} strokeWidth="2.4" />
          </> :
        null}

        {kind === 'wax-melts' ?
        <>
            <rect x="12" y="20" width="40" height="26" rx="3" fill="#FBF8F3" />
            <path d="M12 33h40M25.5 20v26M38.5 20v26" strokeWidth="1.6" opacity="0.6" />
            <path d="M22 52h20" stroke={ACCENT} strokeWidth="2.4" />
            <path d="M26 56h12" stroke={ACCENT} strokeWidth="1.8" opacity="0.7" />
          </> :
        null}

        {kind === 'reed-diffusers' ?
        <>
            <path d="M24 34a8 8 0 0 1 4-7v-5h8v5a8 8 0 0 1 4 7v16a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4V34z" fill="#FBF8F3" />
            <path d="M26 22h12" />
            <path d="M30 22 22 6M34 22l4-16M32.5 22l10-13" stroke={ACCENT} strokeWidth="1.8" />
            <path d="M24 42h16" strokeWidth="1.6" opacity="0.6" />
          </> :
        null}

        {kind === 'room-sprays' ?
        <>
            <path d="M24 28h16v26a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4V28z" fill="#FBF8F3" />
            <path d="M27 20h10v8H27z" fill="#FBF8F3" />
            <path d="M37 14h6" stroke={ACCENT} strokeWidth="2.4" />
            <path d="M45 10h5M45 18h5M48 14h4" stroke={ACCENT} strokeWidth="1.8" />
            <path d="M24 44h16" strokeWidth="1.6" opacity="0.6" />
          </> :
        null}
      </g>
    </svg>);

}
