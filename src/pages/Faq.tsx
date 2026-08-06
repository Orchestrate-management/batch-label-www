import { usePageMeta, useStructuredData } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section, Heading, Rule } from '../components/ui/Section';
import { Accordion } from '../components/ui/Accordion';
import { CtaBand } from '../components/CtaBand';
import { faqGroups, allFaqEntries } from '../content/faqs';
import { breadcrumbSchema, faqPageSchema, graph } from '../lib/structured-data';

export function Faq() {
  usePageMeta({
    title: 'Common questions about CLP labels',
    description:
    'Plain answers on CLP, safety data sheets, UFI codes, allergens, printing, pricing and VAT. Batchlabel covers candles, wax melts, reed diffusers and room sprays.'
  });

  // allFaqEntries is faqGroups flattened, so every question in the markup is a question
  // rendered below it, in the same order.
  useStructuredData(
    graph([breadcrumbSchema('FAQ', '/faq'), faqPageSchema('/faq', allFaqEntries)])
  );

  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="Common questions"
        intro="If your question is not here, email hello@batchlabel.xyz and a person will reply." />


      {/*
        Four accordions stacked used to be four large grey slabs with the group titles
        floating between them. Each group is a two-column spread now: the title holds a
        sticky left rail with a count under it, so a reader scrolling a long page always
        knows which group they are inside, and the questions run at a proper measure on
        the right.
       */}
      <Section>
        <div className="space-y-16 sm:space-y-20">
          {faqGroups.map((group) =>
          <div key={group.title} className="grid gap-8 lg:grid-cols-[0.62fr_1.38fr] lg:gap-16">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <Rule className="mb-5" />
                <Heading level={2} className="text-[1.35rem] sm:text-[1.6rem]">
                  {group.title}
                </Heading>
              </div>
              <Accordion items={group.items} defaultOpen={null} />
            </div>
          )}
        </div>
      </Section>

      <CtaBand
        location="faq_final"
        heading="Try it free before you decide"
        body="No card needed. It is the quickest way to see whether we handle your fragrance properly." />

    </>);

}
