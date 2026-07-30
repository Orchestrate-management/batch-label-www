import { usePageMeta, useStructuredData } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section, Heading } from '../components/ui/Section';
import { Accordion } from '../components/ui/Accordion';
import { CtaBand } from '../components/CtaBand';
import { faqGroups, allFaqEntries } from '../content/faqs';
import { breadcrumbSchema, faqPageSchema, graph } from '../lib/structured-data';

export function Faq() {
  usePageMeta({
    title: 'Common questions about CLP labels for candles',
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
        intro="If your question is not here, email hello@batchlabel.co.uk and a person will reply." />
      

      <Section>
        <div className="space-y-10">
          {faqGroups.map((group) =>
          <div key={group.title}>
              <Heading level={2} className="mb-4 text-[1.3rem] sm:text-[1.5rem]">
                {group.title}
              </Heading>
              <Accordion items={group.items} defaultOpen={null} />
            </div>
          )}
        </div>
      </Section>

      <CtaBand
        location="faq_final"
        heading="Try one label before you decide"
        body="No card needed. It is the quickest way to see whether we handle your fragrance properly." />
      
    </>);

}