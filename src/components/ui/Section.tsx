import React from 'react';
import { twMerge } from 'tailwind-merge';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Renders as <section> by default; pass 'div' when nesting inside another section. */
  as?: 'section' | 'div';
  ariaLabelledBy?: string;
  /**
   * The site was set to max-w-5xl end to end, which on a 1440 screen left the content in
   * a 1024px column with 200px of dead paper either side and every band the same width as
   * every other. The measure is 6xl now — the same box the header row uses, so the mark
   * and the first word of every heading line up — and 'narrow' is available for bands
   * that are nothing but prose.
   *
   * 'wide' is kept as a synonym of the default so call sites reading "wide" still say
   * something true about the band they are on.
   */
  width?: 'default' | 'wide' | 'narrow';
}

/**
 * The one horizontal gutter on the site, and it has to match HEADER_ROW_CLASS in
 * components/layout/HeaderBar.tsx or the mark stops lining up with the content under it.
 */
export const GUTTER = 'px-5 sm:px-6';

export function Section({
  children,
  className,
  id,
  as = 'section',
  ariaLabelledBy,
  width = 'default'
}: SectionProps) {
  const Tag = as;
  return (
    <Tag
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={twMerge(GUTTER, 'py-16 sm:py-24', className)}>

      <div className={twMerge('mx-auto w-full', width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl')}>
        {children}
      </div>
    </Tag>);

}

interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * The section opener. It used to be a line of small caps on its own; it now hangs off a
 * clay registration tick, which is the device that marks the start of every band on the
 * site and the one thing carried over from the swing tag in the mark.
 */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p
      className={twMerge(
        'bl-tick mb-4 font-mono text-[0.7rem] font-medium uppercase tracking-[0.2em] text-clay-600',
        className
      )}>

      {children}
    </p>);

}

interface HeadingProps {
  children: React.ReactNode;
  id?: string;
  level?: 1 | 2 | 3;
  className?: string;
}

export function Heading({ children, id, level = 2, className }: HeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  // A wider interval between the levels than the old scale had. h1 and h2 were 2.9rem
  // and 2.1rem, close enough that a page of h2s read as flat. The display face is a
  // serif now, so the leading tightens as the size goes up rather than staying fixed.
  const sizes = {
    1: 'text-[2.35rem] leading-[1.04] sm:text-[3.4rem] lg:text-[3.9rem]',
    2: 'text-[1.7rem] leading-[1.12] sm:text-[2.3rem]',
    3: 'text-[1.2rem] leading-snug sm:text-[1.35rem]'
  };
  return (
    <Tag
      id={id}
      className={twMerge('font-display font-semibold text-ink', sizes[level], className)}>

      {children}
    </Tag>);

}

export function Lead({ children, className }: EyebrowProps) {
  return (
    <p className={twMerge('max-w-prose text-[1.075rem] leading-[1.65] text-ink-soft', className)}>
      {children}
    </p>);

}

/**
 * A hairline that spans the container, with the clay tick at its left end. Used to close
 * a band or to separate a list from what follows it, in place of another bordered box.
 */
export function Rule({ className }: {className?: string;}) {
  return (
    <div aria-hidden="true" className={twMerge('relative h-px w-full bg-paper-edge', className)}>
      <span className="absolute left-0 top-0 h-px w-9 bg-clay-500" />
    </div>);

}
