import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { openCookieSettings } from '../CookieBanner';

const productLinks = [
{ to: '/how-it-works', label: 'How it works' },
{ to: '/pricing', label: 'Pricing' },
{ to: '/faq', label: 'FAQ' },
{ to: '/sign-up', label: 'Make a label free' }];


const companyLinks = [
{ to: '/about', label: 'About' },
{ to: '/contact', label: 'Contact' }];


const legalLinks = [
{ to: '/terms', label: 'Terms of service' },
{ to: '/privacy', label: 'Privacy policy' },
{ to: '/cookie-policy', label: 'Cookie policy' },
{ to: '/acceptable-use', label: 'Acceptable use' }];


export function SiteFooter() {
  return (
    <footer className="border-t border-paper-edge bg-paper-deep">
      <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-muted">
              UK and EU CLP labels for small batch makers. Candles, wax melts, reed diffusers and
              room sprays.
            </p>
          </div>

          <FooterColumn title="Product" links={productLinks} />
          <FooterColumn title="Company" links={companyLinks} />

          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-[0.1em] text-ink">
              Legal
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {legalLinks.map((link) =>
              <li key={link.to}>
                  <Link to={link.to} className="text-ink-soft hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={openCookieSettings}
                  className="text-ink-soft underline decoration-ink/20 underline-offset-2 hover:text-ink">
                  
                  Cookie settings
                </button>
              </li>
              <li>
                <a href="mailto:hello@batchlabel.co.uk" className="text-ink-soft hover:text-ink">
                  hello@batchlabel.co.uk
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 space-y-3 border-t border-paper-edge pt-6 text-xs leading-relaxed text-ink-muted">
          <p className="max-w-3xl">
            Batchlabel produces labels against published UK CLP and EU CLP requirements using the
            information you give us. We do not certify, approve or verify labels, and we do not give
            legal advice. Responsibility for the final label, and for the accuracy of the safety data
            sheet and recipe details you enter, rests with you as the seller.
          </p>
          <p className="max-w-3xl">
            Batchlabel is a trading name of Orchestrate Technologies Ltd, registered in England and
            Wales, company number 16522544. Registered office: 167-169 Great Portland Street, London
            W1W 5PF.
          </p>
        </div>
      </div>
    </footer>);

}

function FooterColumn({ title, links }: {title: string;links: {to: string;label: string;}[];}) {
  return (
    <div>
      <h2 className="font-display text-sm font-semibold uppercase tracking-[0.1em] text-ink">
        {title}
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((link) =>
        <li key={link.to}>
            <Link to={link.to} className="text-ink-soft hover:text-ink">
              {link.label}
            </Link>
          </li>
        )}
      </ul>
    </div>);

}