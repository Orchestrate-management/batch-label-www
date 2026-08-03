import { usePageMeta, useStructuredData } from '../lib/seo';
import { faqPageSchema, graph } from '../lib/structured-data';
import { PLANS } from '../lib/plans';
import { Hero } from '../components/home/Hero';
import { TrustStrip } from '../components/home/TrustStrip';
import { ProblemCards } from '../components/home/ProblemCards';
import { HowItWorksSteps } from '../components/home/HowItWorksSteps';
import { WhatsIncluded } from '../components/home/WhatsIncluded';
import { Verticals } from '../components/home/Verticals';
import { Testimonials } from '../components/home/Testimonials';
import { FaqSection } from '../components/home/FaqSection';
import { CtaBand } from '../components/CtaBand';
import { homeFaqs } from '../content/faqs';

export function Home() {
  usePageMeta({
    title: 'CLP labels for candle and wax melt makers',
    // Byte-identical to the three static strings in index.html, which is what a crawler
    // that runs no JavaScript reads. structured-data.test.ts asserts they still agree.
    description: `Turn your fragrance supplier's safety data sheet into correct UK and EU CLP label wording for candles, wax melts, diffusers and room sprays. ${PLANS.free.skus} SKUs free, no card.`
  });

  // The six questions in the accordion below, and nothing else. No SoftwareApplication
  // here: the prices are not on this page, so they are marked up on /pricing instead.
  useStructuredData(graph([faqPageSchema('/', homeFaqs)]));

  return (
    <>
      <Hero />
      <TrustStrip />
      <ProblemCards />
      <HowItWorksSteps />
      <WhatsIncluded />
      <Verticals />
      <Testimonials />
      <FaqSection items={homeFaqs} />
      <CtaBand location="home_final" />
    </>);

}