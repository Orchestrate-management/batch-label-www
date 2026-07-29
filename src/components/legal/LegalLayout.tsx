import React from 'react';
import { PageHero } from '../PageHero';

interface LegalLayoutProps {
  title: string;
  updated: string;
  intro?: string;
  children: React.ReactNode;
}

export function LegalLayout({ title, updated, intro, children }: LegalLayoutProps) {
  return (
    <>
      <PageHero eyebrow={`Last updated ${updated}`} title={title} intro={intro} />
      <div className="px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto w-full max-w-prose space-y-8 text-[1rem] leading-relaxed text-ink-soft">
          {children}
        </div>
      </div>
    </>);

}

export function LegalSection({ title, children }: {title: string;children: React.ReactNode;}) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-[1.2rem] font-semibold text-ink">{title}</h2>
      {children}
    </section>);

}

export function LegalList({ items }: {items: React.ReactNode[];}) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item, index) =>
      <li key={index}>{item}</li>
      )}
    </ul>);

}