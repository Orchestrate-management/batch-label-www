import { usePageMeta } from '../../lib/seo';
import { LegalLayout, LegalSection, LegalList } from '../../components/legal/LegalLayout';
import { openCookieSettings } from '../../components/CookieBanner';

export function Privacy() {
  usePageMeta({
    title: 'Privacy policy',
    description:
    'What personal data Batchlabel collects, why we collect it, how long we keep it, who processes it, and the rights you have under UK GDPR.'
  });

  return (
    <LegalLayout
      title="Privacy policy"
      updated="July 2026"
      intro="What we collect, why, and how to make us stop. Written to be read, not to be skipped.">
      
      <LegalSection title="Who is the controller">
        <p>
          Orchestrate Technologies Ltd, trading as Batchlabel, registered in England and Wales,
          company number 16522544, registered office 167-169 Great Portland Street, London W1W 5PF,
          is the data controller. Contact us at{' '}
          <a className="underline decoration-teal-700/40 underline-offset-2" href="mailto:privacy@batchlabel.co.uk">
            privacy@batchlabel.co.uk
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalList
          items={[
          'Account data: your email address, password hash, business name, and the date you signed up. Lawful basis: performance of our contract with you.',
          'Product data: the safety data sheets you upload, recipes, pack sizes, batch codes and the labels you generate. Lawful basis: performance of our contract.',
          'Billing data: your Stripe customer reference, plan, invoices and VAT number if you give one. Card details are handled by Stripe and never reach us. Lawful basis: contract and our legal obligation to keep records.',
          'Marketing attribution data: the campaign values in the link you arrived on, that is utm_source, utm_medium, utm_campaign, utm_term and utm_content, plus advertising click identifiers gclid, gbraid, wbraid and fbclid, the site that referred you, the first page you landed on, and the time of your first visit. These are stored in your browser and, if you create an account, saved against your account record so we know which advert paid for itself. Lawful basis: our legitimate interest in understanding how our advertising performs, and your consent where cookies or similar technologies are not strictly necessary.',
          'Analytics and advertising data: how you move through the site, collected through Google Analytics 4 and the Meta Pixel via Google Tag Manager. Lawful basis: your consent. Nothing optional loads until you agree.',
          'Support data: the emails you send us and our replies. Lawful basis: legitimate interest in helping you.']
          } />
        
      </LegalSection>

      <LegalSection title="Consent and tags">
        <p>
          Analytics and marketing tags are held in a default denied state using Google Consent Mode
          v2 until you choose. You can change your mind at any time using{' '}
          <button
            type="button"
            onClick={openCookieSettings}
            className="underline decoration-teal-700/40 underline-offset-2">
            
            cookie settings
          </button>
          . Rejecting optional cookies does not reduce your access to the product.
        </p>
      </LegalSection>

      <LegalSection title="Who processes data for us">
        <LegalList
          items={[
          'Supabase, for authentication and the database.',
          'Stripe, for payments, tax and invoices.',
          'Google, for Google Tag Manager, Google Analytics 4 and Google Ads measurement, where you have consented.',
          'Meta, for advertising measurement, where you have consented.',
          'Our email provider, for account and support email.']
          } />
        
        <p>
          Some of these providers are outside the UK. Where data leaves the UK or EEA we rely on the
          UK International Data Transfer Addendum or the European Commission standard contractual
          clauses.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep things">
        <LegalList
          items={[
          'Account and product data: while your account is open, then 30 days after you delete it, unless you ask us to remove it sooner.',
          'Billing records: six years, because tax law requires it.',
          'Attribution data: 24 months from first visit.',
          'Analytics data: 14 months in Google Analytics 4.',
          'Support email: three years.']
          } />
        
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          Under the UK GDPR you can ask for a copy of your data, ask us to correct or delete it, ask
          us to restrict or stop certain processing, object to processing based on legitimate
          interests, and withdraw consent for analytics and marketing at any time. Email{' '}
          <a className="underline decoration-teal-700/40 underline-offset-2" href="mailto:privacy@batchlabel.co.uk">
            privacy@batchlabel.co.uk
          </a>{' '}
          and we will reply within one month. If we get it wrong you can complain to the Information
          Commissioner's Office at ico.org.uk.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Data is encrypted in transit and at rest. Access to production data is limited to the people
          who need it. We do not sell personal data, and we do not share your uploaded safety data
          sheets with anyone outside the providers listed above.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>Batchlabel is for businesses and is not intended for anyone under 16.</p>
      </LegalSection>
    </LegalLayout>);

}