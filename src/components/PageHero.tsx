import React from 'react';
import { Eyebrow, Heading, Lead, GUTTER } from './ui/Section';

interface PageHeroProps {
  eyebrow?: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
  /**
   * A legal page is not a marketing page. Its masthead drops the ruled stock and the
   * grain, sets the title smaller, and gives the whole band a quieter foot rule, so a
   * document you are reading because you have to does not open like a pitch.
   */
  tone?: 'marketing' | 'document';
}

export function PageHero({
  eyebrow,
  title,
  intro,
  children,
  tone = 'marketing'
}: PageHeroProps) {
  const isDocument = tone === 'document';
  return (
    <section
      className={`relative overflow-hidden border-b border-paper-edge ${GUTTER} ${
      isDocument ? 'py-12 sm:py-16' : 'bl-ruled py-16 sm:py-24'}`
      }>

      {isDocument ?
      null :
      <div aria-hidden="true" className="bl-grain pointer-events-none absolute inset-0" />
      }
      {/*
        The marketing masthead is a two-column spread from lg up: the title on the left at
        a display measure, the standfirst and any call to action in a narrower column on
        the right, sitting on the baseline of the title block. Stacked in one column it
        left half the band empty on a laptop, which read as a rendering fault rather than
        as negative space. A document masthead stays a single column, because a contract
        with a pull quote beside it is a contract nobody trusts.
       */}
      <div className={`relative mx-auto w-full ${isDocument ? 'max-w-3xl' : 'max-w-6xl'}`}>
        {isDocument ?
        <>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Heading level={1} className="max-w-[18ch] text-[2rem] sm:text-[2.6rem]">
              {title}
            </Heading>
            {intro ? <Lead className="mt-5 text-[1rem]">{intro}</Lead> : null}
            {children ? <div className="mt-9">{children}</div> : null}
          </> :

        <div className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-end lg:gap-16">
            <div>
              {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
              <Heading level={1} className="max-w-[16ch]">
                {title}
              </Heading>
            </div>
            {intro || children ?
          <div className="lg:pb-2">
                {intro ?
            <Lead className="border-l-2 border-clay-500/45 pl-5 text-[1.05rem] lg:border-l-0 lg:pl-0">
                    {intro}
                  </Lead> :
            null}
                {children ? <div className="mt-8">{children}</div> : null}
              </div> :
          null}
          </div>
        }
      </div>
    </section>);

}
