import { usePageMeta } from '../../lib/seo';
import { LegalLayout, LegalSection, LegalList } from '../../components/legal/LegalLayout';

export function AcceptableUse() {
  usePageMeta({
    title: 'Acceptable use policy',
    description:
    'The short list of things you must not do with Batchlabel, including misrepresenting our output as an approval or certification.'
  });

  return (
    <LegalLayout
      title="Acceptable use policy"
      updated="July 2026"
      intro="Short and obvious. This policy forms part of our terms of service.">
      
      <LegalSection title="Please do not">
        <LegalList
          items={[
          'Describe a Batchlabel output as certified, approved, verified or guaranteed by us, or imply that we take responsibility for your label. We do not, and saying otherwise misleads your customers.',
          'Upload safety data sheets or documents you have no right to use, or anyone else\u2019s confidential information.',
          'Use the service to label a product you know to be unsafe, or to hide a hazard you are aware of.',
          'Resell, white label or repackage Batchlabel output as a compliance assessment service without a written agreement with us.',
          'Share one account across separate businesses, or exceed the number of people your plan allows.',
          'Scrape, reverse engineer, load test or attack the service, or try to reach data belonging to another account.',
          'Upload malware, or use the service to send unlawful, abusive or infringing content.',
          'Circumvent usage limits, watermarks or payment.']
          } />
        
      </LegalSection>

      <LegalSection title="What happens if you do">
        <p>
          We will normally email you first and ask you to put it right. For serious matters, in
          particular anything that puts consumers at risk or threatens the service for other makers,
          we may suspend or close the account immediately. Where the law requires it, we will report
          the matter to the relevant authority.
        </p>
      </LegalSection>

      <LegalSection title="Reporting misuse">
        <p>
          If you see Batchlabel being misrepresented or misused, tell us at{' '}
          <a className="underline decoration-teal-700/40 underline-offset-2" href="mailto:hello@batchlabel.co.uk">
            hello@batchlabel.co.uk
          </a>
          . We take it seriously, because our credibility depends on being straight about what the
          tool does.
        </p>
      </LegalSection>
    </LegalLayout>);

}