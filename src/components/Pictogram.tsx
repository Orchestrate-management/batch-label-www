import React from 'react';

type PictogramKind = 'irritant' | 'environment' | 'flammable';

interface PictogramProps {
  kind: PictogramKind;
  size?: number;
  label: string;
}

/**
 * Simplified CLP hazard pictogram: red diamond on white, drawn as inline SVG so it stays
 * crisp at print sizes and adds no image weight.
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
      <g fill="#1B2523">
        {kind === 'irritant' ?
        <>
            <rect x="29.5" y="19" width="5" height="18" rx="2.5" />
            <circle cx="32" cy="43" r="3.2" />
          </> :
        null}
        {kind === 'environment' ?
        <>
            <path d="M14 44h36c-2 3-5 5-9 5H23c-4 0-7-2-9-5z" />
            <path d="M40 22c-5 2-8 6-9 11 3-1 6-3 8-6 1-2 1-3 1-5z" />
            <path d="M27 40c-4-3-6-8-5-13 3 2 5 6 6 10 0 1 0 2-1 3z" />
          </> :
        null}
        {kind === 'flammable' ?
        <path d="M32 17c6 7 9 11 9 17a9 9 0 0 1-18 0c0-4 2-6 4-9 1 3 2 4 4 5-2-5-2-9 1-13z" /> :
        null}
      </g>
    </svg>);

}