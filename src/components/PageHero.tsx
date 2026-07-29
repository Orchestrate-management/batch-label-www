import React from 'react';
import { Eyebrow, Heading, Lead } from './ui/Section';

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}

export function PageHero({ eyebrow, title, intro, children }: PageHeroProps) {
  return (
    <section className="bl-grain border-b border-paper-edge px-5 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-5xl">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Heading level={1}>{title}</Heading>
        {intro ? <Lead className="mt-4">{intro}</Lead> : null}
        {children ? <div className="mt-7">{children}</div> : null}
      </div>
    </section>);

}