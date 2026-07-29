import React from 'react';
import { Link } from 'react-router-dom';
import { Section, Heading, Eyebrow } from '../ui/Section';
import { Accordion, type AccordionItem } from '../ui/Accordion';

interface FaqSectionProps {
  items: AccordionItem[];
  heading?: string;
  eyebrow?: string;
  showAllLink?: boolean;
  className?: string;
}

export function FaqSection({
  items,
  heading = 'Questions makers ask us',
  eyebrow = 'FAQ',
  showAllLink = true,
  className
}: FaqSectionProps) {
  return (
    <Section className={className} ariaLabelledBy="faq-heading">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading id="faq-heading">{heading}</Heading>
      <div className="mt-7">
        <Accordion items={items} />
      </div>
      {showAllLink ?
      <p className="mt-5 text-sm text-ink-soft">
          More detail on the{' '}
          <Link to="/faq" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            full FAQ page
          </Link>
          .
        </p> :
      null}
    </Section>);

}