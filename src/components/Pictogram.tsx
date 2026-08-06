
type PictogramKind = 'irritant' | 'environment' | 'flammable';

interface PictogramProps {
  kind: PictogramKind;
  size?: number;
  label: string;
}

/**
 * Simplified CLP hazard pictogram: red diamond on white, drawn as inline SVG so it stays
 * crisp at print sizes and adds no image weight.
 *
 * The red (#D0021B) and the white field are set by regulation, not by the brand, and
 * public/brand/README.md says so — do not restyle them to the palette.
 *
 * The drawings were redone in the visual pass because the environment mark was two
 * strokes that read as a tick, which on a hazard pictogram is the worst possible
 * misreading. GHS09 is a dead fish over a dead tree; that is what it draws now. These are
 * still simplifications for a marketing page. The pictograms Batchlabel puts on a real
 * label are the Annex V artwork at the Annex I minimum size.
 */
export function Pictogram({ kind, size = 44, label }: PictogramProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className="shrink-0">

      <g transform="rotate(45 32 32)">
        <rect x="12" y="12" width="40" height="40" rx="2" fill="#ffffff" stroke="#D0021B" strokeWidth="5" />
      </g>
      <g fill="#1E1B18">
        {kind === 'irritant' ?
        <>
            <rect x="29.6" y="18" width="4.8" height="19" rx="2.4" />
            <circle cx="32" cy="43.6" r="3.1" />
          </> :
        null}

        {kind === 'environment' ?
        <>
            {/* Waterline. */}
            <rect x="16" y="39" width="32" height="2.2" rx="1.1" />
            {/* Dead fish, belly up, with a cross for an eye. */}
            <path d="M26 47c3.6-3.2 9.2-3.2 12.8 0-3.6 3.2-9.2 3.2-12.8 0z" />
            <path d="M40.6 43.6 45 47l-4.4 3.4z" />
            <path
            d="m28.3 44.6 2.4 2.4M30.7 44.6l-2.4 2.4"
            stroke="#ffffff"
            strokeWidth="1.1"
            strokeLinecap="round" />

            {/* Dead tree: bare trunk with two broken limbs. */}
            <path d="M30.6 37V22h2.8v15z" />
            <path d="M31.4 27.6 25 21.4l1.8-1.8 5.4 5.4zM32.6 25.6l5.6-5.6 1.8 1.8-6 6z" />
          </> :
        null}

        {kind === 'flammable' ?
        <path d="M32 15c6.4 7.4 9.6 11.6 9.6 17.6a9.6 9.6 0 0 1-19.2 0c0-4.2 2.1-6.4 4.3-9.6 1.1 3.2 2.1 4.3 4.3 5.4-2.1-5.4-2.1-9.7 1-13.4z" /> :
        null}
      </g>
    </svg>);

}
