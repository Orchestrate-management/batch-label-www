import React from 'react';
import { PageHero } from '../PageHero';

interface LegalLayoutProps {
  title: string;
  updated: string;
  intro?: string;
  children: React.ReactNode;
}

/**
 * The legal pages are documents, not marketing.
 *
 * They used to inherit the marketing masthead — grain, the big display size, the same
 * container — and then run 68 characters wide in the same grey the home page uses for
 * sales copy. Somebody reads these because they have to, often on a phone, sometimes
 * before they decide whether to trust us with a supplier document.
 *
 * So: no texture, a 62-character measure, ink rather than ink-soft for the body, 1.8
 * leading, and the section headings hung off a hairline instead of set as headlines. The
 * page prints cleanly too — index.css drops the header and footer at print.
 */
export function LegalLayout({ title, updated, intro, children }: LegalLayoutProps) {
  return (
    <>
      <PageHero eyebrow={`Last updated ${updated}`} title={title} intro={intro} tone="document" />
      <div className="px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-legal space-y-11 text-[1.02rem] leading-[1.8] text-ink">
          {children}
        </div>
      </div>
    </>);

}

export function LegalSection({ title, children }: {title: string;children: React.ReactNode;}) {
  return (
    <section className="space-y-3.5 border-t border-paper-edge pt-7 first:border-t-0 first:pt-0">
      <h2 className="font-display text-[1.25rem] font-semibold leading-snug text-ink">{title}</h2>
      {children}
    </section>);

}

export function LegalList({ items }: {items: React.ReactNode[];}) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) =>
      <li key={index} className="grid grid-cols-[1.1rem_1fr] gap-x-2">
          <span aria-hidden="true" className="mt-[0.7em] h-1 w-1 rotate-45 bg-clay-500" />
          <span>{item}</span>
        </li>
      )}
    </ul>);

}
