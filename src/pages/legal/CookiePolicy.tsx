import { usePageMeta, useStructuredData } from '../../lib/seo';
import { breadcrumbSchema, graph } from '../../lib/structured-data';
import { LegalLayout, LegalSection } from '../../components/legal/LegalLayout';
import { openCookieSettings } from '../../components/CookieBanner';
import { Button } from '../../components/ui/Button';

const rows = [
{
  name: 'bl_consent',
  category: 'Strictly necessary',
  purpose: 'Remembers your cookie choices so we do not ask again.',
  life: '6 months'
},
{
  name: 'bl_attr',
  category: 'Marketing, set only with consent',
  purpose:
  'Stores the campaign and click values from the link you first arrived on, so we can tell which advert brought you here.',
  life: '12 months'
},
{
  name: 'sb-access-token, sb-refresh-token',
  category: 'Strictly necessary',
  purpose: 'Keeps you signed in to your Batchlabel account. Set by Supabase.',
  life: 'Session and 30 days'
},
{
  name: '_ga, _ga_*',
  category: 'Analytics, set only with consent',
  purpose: 'Google Analytics 4 measures which pages help and which confuse.',
  life: '13 months'
},
{
  name: '_fbp',
  category: 'Marketing, set only with consent',
  purpose: 'Meta Pixel measures whether a Facebook or Instagram advert led to a sign up.',
  life: '3 months'
},
{
  name: '_gcl_au',
  category: 'Marketing, set only with consent',
  purpose: 'Google Ads conversion measurement.',
  life: '3 months'
}];


export function CookiePolicy() {
  usePageMeta({
    title: 'Cookie policy',
    description:
    'Every cookie Batchlabel sets, what it does, how long it lasts, and how to change your choices at any time.'
  });

  useStructuredData(graph([breadcrumbSchema('Cookie policy', '/cookie-policy')]));

  return (
    <LegalLayout
      title="Cookie policy"
      updated="July 2026"
      intro="A short list of what we set and why. Optional cookies do not load until you say yes.">
      
      <LegalSection title="How consent works here">
        <p>
          Tags are managed through Google Tag Manager and held in a default denied state using Google
          Consent Mode v2. Until you accept, analytics and advertising tags do not run and no
          analytics or marketing cookies are written. Choosing "Reject optional" keeps them off.
        </p>
        <div>
          <Button variant="secondary" onClick={openCookieSettings}>
            Change your cookie settings
          </Button>
        </div>
      </LegalSection>

      <LegalSection title="What we set">
        <div className="overflow-x-auto rounded-2xl border border-paper-edge bg-white">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <caption className="sr-only">Cookies used by Batchlabel</caption>
            <thead>
              <tr className="border-b border-paper-edge text-xs uppercase tracking-wide text-ink-muted">
                <th scope="col" className="px-4 py-3 font-semibold">Name</th>
                <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                <th scope="col" className="px-4 py-3 font-semibold">Purpose</th>
                <th scope="col" className="px-4 py-3 font-semibold">Life</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
              <tr key={row.name} className="border-b border-paper-edge last:border-0 align-top">
                  <th scope="row" className="px-4 py-3 font-mono text-xs font-normal text-ink">
                    {row.name}
                  </th>
                  <td className="px-4 py-3 text-ink-soft">{row.category}</td>
                  <td className="px-4 py-3 text-ink-soft">{row.purpose}</td>
                  <td className="px-4 py-3 text-ink-soft">{row.life}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Local storage">
        <p>
          We also use your browser's local storage for the same two purposes: remembering your cookie
          choice, and keeping the first campaign values we saw. Clearing site data removes both, and
          the banner will ask again on your next visit.
        </p>
      </LegalSection>

      <LegalSection title="Browser controls">
        <p>
          You can block or delete cookies in your browser settings. Blocking the strictly necessary
          ones will stop you signing in, because that is how the session is kept.
        </p>
      </LegalSection>
    </LegalLayout>);

}