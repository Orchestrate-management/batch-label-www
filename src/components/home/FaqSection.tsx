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
    <Section className={className} ariaLabelledBy="faq-heading" width="wide">
      <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading id="faq-heading">{heading}</Heading>
          {showAllLink ?
          <p className="mt-6 text-[0.95rem] text-ink-soft">
              More detail on the{' '}
              <Link to="/faq" className="bl-link text-teal-700">
                full FAQ page
              </Link>
              .
            </p> :
          null}
        </div>
        <div>
          <Accordion items={items} />
        </div>
      </div>
    </Section>);

}
