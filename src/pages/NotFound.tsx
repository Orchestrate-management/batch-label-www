import React from 'react';
import { usePageMeta } from '../lib/seo';
import { Button } from '../components/ui/Button';

export function NotFound() {
  usePageMeta({
    title: 'Page not found',
    description: 'That page does not exist.',
    noIndex: true
  });

  return (
    <section className="px-5 py-20 sm:px-6">
      <div className="mx-auto w-full max-w-xl text-center">
        <p className="font-mono text-sm text-ink-muted">404</p>
        <h1 className="mt-2 font-display text-[1.8rem] font-semibold tracking-[-0.015em] text-ink">
          We cannot find that page
        </h1>
        <p className="mt-3 text-[1.02rem] leading-relaxed text-ink-soft">
          The link may be old, or we may have moved something.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button to="/" size="lg">
            Back to the home page
          </Button>
          <Button to="/contact" variant="secondary" size="lg">
            Tell us about the broken link
          </Button>
        </div>
      </div>
    </section>);

}