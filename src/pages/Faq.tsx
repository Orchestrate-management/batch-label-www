import { usePageMeta } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section, Heading } from '../components/ui/Section';
import { Accordion } from '../components/ui/Accordion';
import { CtaBand } from '../components/CtaBand';
import { faqGroups } from '../content/faqs';

export function Faq() {
  usePageMeta({
    title: 'Frequently asked questions',
    description:
    'Plain answers about compliance labelling: which product categories we cover, cosmetics labelling coming next, safety data sheets, UFI codes, allergens, printing, pricing, VAT and cancellation. Candles, wax melts and diffusers live today.'
  });

  return (
    <>
      <PageHero
        eyebrow="FAQ"
        title="Questions, answered plainly"
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
        heading="Still not sure? Try one label."
        body="The free label costs nothing and needs no card. It is the quickest way to see whether we handle your fragrance properly." />
      
    </>);

}