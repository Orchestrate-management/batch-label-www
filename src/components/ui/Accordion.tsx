import React, { useId, useState } from 'react';
import { PlusIcon, MinusIcon } from 'lucide-react';

export interface AccordionItem {
  question: string;
  answer: React.ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  /** Index of the row open on first paint. Pass null for all closed. */
  defaultOpen?: number | null;
}

/**
 * Ruled rows rather than a bordered box.
 *
 * The old accordion was a white card with dividers, so on the FAQ page — four of them
 * stacked — the page was four large grey rectangles. The rows are now hairlines on the
 * page's own stock, the open row is marked by a clay rule down its left edge, and the
 * toggle is a full-height target rather than a 44px strip.
 */
export function Accordion({ items, defaultOpen = 0 }: AccordionProps) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const baseId = useId();

  return (
    <div className="border-t border-paper-edge">
      {items.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <div
            key={item.question}
            className={`border-b border-paper-edge ${isOpen ? 'bg-white' : ''}`}>

            <h3 className="m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className={`flex w-full items-start justify-between gap-5 px-4 py-5 text-left font-display text-[1.06rem] font-semibold leading-snug text-ink transition-colors hover:bg-white sm:px-6 ${
                isOpen ? 'border-l-2 border-clay-500' : 'border-l-2 border-transparent'}`
                }>

                <span>{item.question}</span>
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-paper-edge bg-paper text-teal-700">

                  {isOpen ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="border-l-2 border-clay-500 px-4 pb-6 pr-8 text-[0.99rem] leading-[1.7] text-ink-soft sm:px-6 sm:pr-16">

              {item.answer}
            </div>
          </div>);

      })}
    </div>);

}
