import { Link } from 'react-router-dom';

/**
 * The Batchlabel mark: a punched swing tag. A punch hole top left, then two rule lines,
 * the lower one in clay. Flat, single weight, holds down to 16px.
 *
 * Geometry and colours come from the brand pack in public/brand — this is the same
 * artwork as batchlabel-lockup-horizontal.svg, inlined so the wordmark renders in the
 * live Outfit webfont and stays crisp at any size. Keep the two in step if either moves.
 *
 * Rules from the pack: clear space of half the mark height on every side, minimum 16px
 * for the mark and 96px wide for the lockup, and no gradients, shadows, outlines or
 * rotation.
 */
interface LogoProps {
  className?: string;
  /** Mark height in px. The wordmark scales from it. */
  size?: number;
  /** For teal or dark backgrounds. Uses the lighter clay accent, per the brand pack. */
  reversed?: boolean;
  /** Mark only, no wordmark. */
  markOnly?: boolean;
}

export function Logo({
  className = '',
  size = 28,
  reversed = false,
  markOnly = false
}: LogoProps) {
  const tag = reversed ? '#FBF8F3' : '#14514F';
  const knockout = reversed ? '#14514F' : '#FBF8F3';
  // Clay lifts to #E5A183 on teal so the accent rule stays visible, matching the pack's
  // reversed lockup.
  const accent = reversed ? '#E5A183' : '#B4674A';

  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 font-display font-semibold tracking-[-0.02em] ${
      reversed ? 'text-paper' : 'text-teal-700'} ${className}`}
      style={{ fontSize: size * 0.68 }}>

      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
        className="shrink-0">

        <rect x="6" y="6" width="52" height="52" rx="13" fill={tag} />
        <circle cx="20" cy="20" r="4.5" fill={knockout} />
        <rect x="16" y="34" width="32" height="4.5" rx="2.25" fill={knockout} />
        <rect x="16" y="44" width="20" height="4.5" rx="2.25" fill={accent} />
      </svg>
      {markOnly ?
      <span className="sr-only">Batchlabel, home</span> :

      <span>
          Batchlabel
          <span className="sr-only">, home</span>
        </span>
      }
    </Link>);

}
