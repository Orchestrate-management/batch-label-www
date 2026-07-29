import React from 'react';
import { FileTextIcon } from 'lucide-react';
import { usePageMeta } from '../../lib/seo';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../lib/auth';

export function Labels() {
  usePageMeta({
    title: 'Your labels',
    description: 'Your Batchlabel dashboard.',
    noIndex: true
  });

  const { user } = useAuth();
  const name = user?.user_metadata?.business_name as string | undefined ?? null;

  return (
    <div>
      <h1 className="font-display text-[1.5rem] font-semibold tracking-[-0.015em] text-ink sm:text-[1.8rem]">
        {name ? `Welcome, ${name}` : 'Your labels'}
      </h1>
      <p className="mt-2 max-w-prose text-[0.98rem] leading-relaxed text-ink-soft">
        Nothing here yet. Have the safety data sheet from your fragrance supplier to hand and you can
        be done in about ten minutes.
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-paper-edge bg-white px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
          <FileTextIcon size={22} className="text-teal-700" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-display text-[1.15rem] font-semibold text-ink">
          No labels yet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Your first label is free. You will need your supplier safety data sheet, your fragrance
          percentage and your pack size.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {/* TODO: point this at the label builder once the product route exists. */}
          <Button to="/dashboard" track={{ label: 'Create your first label', location: 'dashboard_empty' }}>
            Create your first label
          </Button>
          <Button to="/how-it-works" variant="secondary">
            Read the three steps
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
        { title: 'Saved recipes', body: 'Reuse a fragrance and pack size instead of starting again.' },
        { title: 'Batch codes', body: 'Add a batch code and date to each print run.' },
        { title: 'Print ready files', body: 'PDF at true size, plus SVG for a print shop.' }].
        map((card) =>
        <div key={card.title} className="rounded-2xl border border-paper-edge bg-white p-5">
            <h3 className="font-display text-[1rem] font-semibold text-ink">{card.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{card.body}</p>
          </div>
        )}
      </div>
    </div>);

}