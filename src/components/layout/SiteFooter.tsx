import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { openCookieSettings } from '../CookieBanner';

const productLinks = [
{ to: '/how-it-works', label: 'How it works' },
{ to: '/pricing', label: 'Pricing' },
{ to: '/faq', label: 'FAQ' },
{ to: '/sign-up', label: 'Make a label free' }];


const companyLinks = [
{ to: '/contact', label: 'Contact' }];


const legalLinks = [
{ to: '/terms', label: 'Terms of service' },
{ to: '/privacy', label: 'Privacy policy' },
{ to: '/cookie-policy', label: 'Cookie policy' },
{ to: '/acceptable-use', label: 'Acceptable use' }];


/**
 * The colophon.
 *
 * It was a four-column link grid on a barely-different tint with two paragraphs of small
 * print underneath, and the whole thing read as an afterthought. It is on the darkest
 * warm stock now, opens with a hairline of clay, gives the mark and the description a
 * column of their own, and sets the column headings in the mono face at the same size as
 * every other caption on the site. The two paragraphs of small print are legally load
 * bearing, so they are set at a readable size on their own rule rather than shrunk.
 */
export function SiteFooter() {
  return (
    <footer className="relative border-t border-paper-edge bg-paper-shade">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-clay-500/35" />
      <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:gap-8">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[0.92rem] leading-[1.65] text-ink-muted">
              UK and EU CLP labels for small batch makers. Candles, wax melts, reed diffusers and
              room sprays.
            </p>
          </div>

          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Company" links={companyLinks} />

          <div>
            <h2 className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.16em] text-ink">
              Legal
            </h2>
            <ul className="mt-4 space-y-2.5 text-[0.92rem]">
              {legalLinks.map((link) =>
              <li key={link.to}>
                  <Link
                  to={link.to}
                  className="inline-flex min-h-[1.75rem] items-center text-ink-soft transition-colors hover:text-ink">

                    {link.label}
                  </Link>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={openCookieSettings}
                  className="bl-link inline-flex min-h-[1.75rem] items-center text-ink-soft hover:text-ink">

                  Cookie settings
                </button>
              </li>
              <li>
                <a
                  href="mailto:hello@batchlabel.xyz"
                  className="inline-flex min-h-[1.75rem] items-center font-mono text-[0.82rem] text-ink-soft transition-colors hover:text-ink">

                  hello@batchlabel.xyz
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="relative mt-14 border-t border-paper-edge pt-8">
          <span aria-hidden="true" className="absolute left-0 top-0 h-px w-9 bg-clay-500" />
          <div className="grid gap-6 text-[0.82rem] leading-[1.7] text-ink-muted lg:grid-cols-2 lg:gap-12">
            <p>
              Batchlabel produces labels against published UK CLP and EU CLP requirements using the
              information you give us. We do not certify, approve or verify labels, and we do not give
              legal advice. Responsibility for the final label, and for the accuracy of the safety data
              sheet and recipe details you enter, rests with you as the seller.
            </p>
            <p>
              Batchlabel is a trading name of Orchestrate Technologies Ltd, registered in England and
              Wales, company number 16522544. Registered office: 167-169 Great Portland Street, London
              W1W 5PF.
            </p>
          </div>
        </div>
      </div>
    </footer>);

}

function FooterColumn({ title, links }: {title: string;links: {to: string;label: string;}[];}) {
  return (
    <div>
      <h2 className="font-mono text-[0.7rem] font-medium uppercase tracking-[0.16em] text-ink">
        {title}
      </h2>
      <ul className="mt-4 space-y-2.5 text-[0.92rem]">
        {links.map((link) =>
        <li key={link.to}>
            <Link
            to={link.to}
            className="inline-flex min-h-[1.75rem] items-center text-ink-soft transition-colors hover:text-ink">

              {link.label}
            </Link>
          </li>
        )}
      </ul>
    </div>);

}
