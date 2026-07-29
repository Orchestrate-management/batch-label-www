import React from 'react';
import { twMerge } from 'tailwind-merge';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  /** Renders as <section> by default; pass 'div' when nesting inside another section. */
  as?: 'section' | 'div';
  ariaLabelledBy?: string;
}

export function Section({ children, className, id, as = 'section', ariaLabelledBy }: SectionProps) {
  const Tag = as;
  return (
    <Tag id={id} aria-labelledby={ariaLabelledBy} className={twMerge('px-5 py-14 sm:px-6 sm:py-20', className)}>
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </Tag>);

}

interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <p
      className={twMerge(
        'mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-clay-600',
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
  const sizes = {
    1: 'text-[2rem] leading-[1.12] sm:text-[2.9rem]',
    2: 'text-[1.6rem] leading-[1.18] sm:text-[2.1rem]',
    3: 'text-lg sm:text-xl'
  };
  return (
    <Tag
      id={id}
      className={twMerge('font-display font-semibold tracking-[-0.015em] text-ink', sizes[level], className)}>
      
      {children}
    </Tag>);

}

export function Lead({ children, className }: EyebrowProps) {
  return (
    <p className={twMerge('max-w-prose text-[1.05rem] leading-relaxed text-ink-soft', className)}>
      {children}
    </p>);

}