import { FileTextIcon } from 'lucide-react';
import { usePageMeta } from '../../lib/seo';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../lib/auth';
import { APP_URL } from '../../lib/app-handoff';

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
        Your labels are made in Batchlabel itself, at app.batchlabel.xyz. You are already signed in
        there. This page is for your account and your billing.
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-paper-edge bg-white px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50">
          <FileTextIcon size={22} className="text-teal-700" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-display text-[1.15rem] font-semibold text-ink">
          Make your first label
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          You will need your supplier safety data sheet, your fragrance percentage and your pack
          size. About ten minutes.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {/*
            The label builder is the product, and the product is app.batchlabel.xyz.
            This used to link to /dashboard — the page it is on — so the first thing a
            new customer pressed after confirming their email did nothing at all.
            The session is in a cookie on .batchlabel.xyz, so they arrive signed in.
           */}
          <Button
            href={APP_URL}
            track={{ label: 'Open Batchlabel', location: 'dashboard_empty' }}>
            Open Batchlabel
          </Button>
          <Button to="/how-it-works" variant="secondary">
            Read the three steps
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
        { title: 'One fragrance, many sizes', body: 'Reuse a fragrance across pack sizes. Each pack size is its own SKU.' },
        { title: 'Batch codes', body: 'Batch code and date fields on the label.' },
        { title: 'True size preview', body: 'See the label at the size it will print, before you commit to a run.' }].
        map((card) =>
        <div key={card.title} className="rounded-2xl border border-paper-edge bg-white p-5">
            <h3 className="font-display text-[1rem] font-semibold text-ink">{card.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{card.body}</p>
          </div>
        )}
      </div>
    </div>);

}