import React from 'react';
import { usePageMeta } from '../lib/seo';
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
    description:
    'Compliance labelling for small batch makers. Upload your fragrance supplier safety data sheet, enter your recipe and pack size, and download a print ready UK and EU CLP label in minutes. Candles today, cosmetics next. Free first label, no card needed.'
  });

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