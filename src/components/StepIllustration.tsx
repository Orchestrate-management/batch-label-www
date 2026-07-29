import React from 'react';

type StepKind = 'upload' | 'recipe' | 'download';

interface StepIllustrationProps {
  kind: StepKind;
}

/**
 * Small line illustrations for the three steps. Flat, two colour, no photography.
 */
export function StepIllustration({ kind }: StepIllustrationProps) {
  const stroke = '#134F49';
  const accent = '#B85F3A';

  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      aria-hidden="true"
      focusable="false">
      
      <rect x="1.5" y="1.5" width="53" height="53" rx="14" fill="#EFF5F4" />
      {kind === 'upload' ?
      <g stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 14h11l6 6v22a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V16a2 2 0 0 1 2-2z" />
          <path d="M31 14v6h6" />
          <path d="M27.5 37V26" stroke={accent} />
          <path d="M23.5 30l4-4 4 4" stroke={accent} />
        </g> :
      null}
      {kind === 'recipe' ?
      <g stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 13h10v6a13 13 0 0 1 5 10v10a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V29a13 13 0 0 1 5-10v-6z" />
          <path d="M19 33h18" stroke={accent} />
          <path d="M27 24h2" />
        </g> :
      null}
      {kind === 'download' ?
      <g stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="15" y="14" width="26" height="20" rx="3" />
          <path d="M20 22h10M20 27h14" />
          <path d="M28 36v6" stroke={accent} />
          <path d="M24.5 38.5l3.5 3.5 3.5-3.5" stroke={accent} />
        </g> :
      null}
    </svg>);

}