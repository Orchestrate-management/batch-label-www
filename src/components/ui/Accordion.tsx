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

export function Accordion({ items, defaultOpen = 0 }: AccordionProps) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  const baseId = useId();

  return (
    <div className="divide-y divide-paper-edge overflow-hidden rounded-2xl border border-paper-edge bg-white">
      {items.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${baseId}-panel-${index}`;
        const buttonId = `${baseId}-button-${index}`;
        return (
          <div key={item.question}>
            <h3 className="m-0">
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left font-display text-[1.02rem] font-medium text-ink hover:bg-paper-deep/60 sm:px-6">
                
                <span>{item.question}</span>
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-teal-700">
                  {isOpen ? <MinusIcon size={18} /> : <PlusIcon size={18} />}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="px-5 pb-5 text-[0.97rem] leading-relaxed text-ink-soft sm:px-6">
              
              {item.answer}
            </div>
          </div>);

      })}
    </div>);

}