import { Link } from 'react-router-dom';
import { usePageMeta, useStructuredData } from '../../lib/seo';
import { breadcrumbSchema, graph } from '../../lib/structured-data';
import { LegalLayout, LegalSection, LegalList } from '../../components/legal/LegalLayout';
import { PLANS, PUBLIC_PLANS, SKU_DEFINITION, priceWithInterval, skuAllowance } from '../../lib/plans';

/**
 * "Maker (£14/month exc VAT, £140/year exc VAT), Studio (…)".
 *
 * Derived rather than typed. A hand-typed price in a contract of sale is the worst place
 * for the ladder to drift, and this page previously named one plan as if it were the only
 * one that could be bought.
 */
function paidPlanSentence(): string {
  return PUBLIC_PLANS.
  filter((plan) => plan.monthlyPence !== null && plan.annualPence !== null).
  map(
    (plan) =>
    `${plan.label} (${priceWithInterval(plan.monthlyPence as number, 'monthly')}, or ${priceWithInterval(
      plan.annualPence as number,
      'annual'
    )})`
  ).
  join('; ');
}

export function Terms() {
  usePageMeta({
    title: 'Terms of service',
    description:
    'The terms on which you use Batchlabel, including what the label generator does, the limits of our role, subscriptions, cancellation and liability.'
  });

  useStructuredData(graph([breadcrumbSchema('Terms of service', '/terms')]));

  return (
    <LegalLayout
      title="Terms of service"
      updated="July 2026"
      intro="Plain terms for a small tool. Please read the section on what Batchlabel does and does not do, because it matters more than the rest.">
      
      <LegalSection title="1. Who we are">
        <p>
          Batchlabel is a trading name of Orchestrate Technologies Ltd, registered in England and
          Wales, company number 16522544. Registered office: 167-169 Great Portland Street, London
          W1W 5PF. In these terms, "we" and "us" mean Orchestrate Technologies Ltd, and "you" means
          the person or business using Batchlabel.
        </p>
      </LegalSection>

      <LegalSection title="2. What the service does">
        <p>
          Batchlabel takes information you provide, including a supplier safety data sheet, a
          fragrance percentage, a pack size and your business details, and produces label artwork
          laid out against published labelling requirements under the GB CLP Regulation and EU
          Regulation 1272/2008 on Classification, Labelling and Packaging.
        </p>
        <p>
          The output is artwork generated from your inputs. It is a tool that saves you time. It is
          not a certification, an approval, an inspection, a safety assessment or legal advice.
        </p>
      </LegalSection>

      <LegalSection title="3. What the service does not do, and your responsibility">
        <p>
          This is the most important section in these terms. By using Batchlabel you accept the
          following.
        </p>
        <LegalList
          items={[
          'We do not certify, approve, verify or confirm that any label meets your legal obligations, and we do not represent that it does.',
          'We do not carry out a chemical safety assessment or a classification review by a qualified toxicologist.',
          'Our output depends entirely on the accuracy and currency of the information you enter, including the safety data sheet you upload and the percentages you type. We cannot detect an out of date safety data sheet or an incorrect recipe.',
          'You remain the supplier of your product for the purposes of labelling law. Responsibility for the final label, for checking it against your own product and circumstances, and for any other obligation such as poison centre notification, packaging, weights and measures or product safety, rests with you.',
          'Regulations, guidance and their interpretation change. We update the service as we become aware of changes, but we do not warrant that the service reflects every change at any given moment.',
          'Where your product is unusual, borderline, or your safety data sheet is incomplete, you should take independent professional advice before selling.']
          } />
        
        <p>
          If you need someone to take legal responsibility for your classification, engage a suitably
          qualified consultant. Batchlabel is not a substitute for that, and we will say so plainly
          whenever anyone asks.
        </p>
      </LegalSection>

      <LegalSection title="4. Your account">
        <p>
          You must give an accurate email address, keep your password to yourself, and tell us
          promptly if you think someone else has access. You are responsible for activity under your
          account. Accounts are for one business, and an account is a single login: we do not
          currently offer additional editor or read-only seats on any plan.
        </p>
      </LegalSection>

      <LegalSection title="5. Plans, prices and payment">
        <p>
          Plans are sold by the number of SKUs they cover. {SKU_DEFINITION}
        </p>
        <LegalList
          items={[
          `The Free plan covers ${skuAllowance(PLANS.free)} and requires no payment card. It does not expire, and it produces the same label as every paid plan: nothing that a label needs in order to be correct sits behind a price.`,
          `Paid plans are ${paidPlanSentence()}.`,
          'All prices shown on the site exclude VAT. VAT is added at checkout by Stripe according to your location and your VAT number if you give one. All prices are in GBP for customers in every country.',
          'Payments are handled by Stripe. We never see or store your full card details.',
          'Subscriptions renew automatically until cancelled. You can cancel at any time through the billing portal, and you keep access until the end of the period you have paid for.',
          // No pro rata refund is promised, because none is issued: cancellation in the
          // billing portal takes effect at the end of the paid period with no proration.
          // Copy conforms to the mechanism, never the other way round.
          'If Batchlabel does not do what the pricing page describes, tell us within 14 days of payment and we will refund you in full if we cannot put it right. Outside that, cancelling ends the plan at the end of the period you have already paid for rather than refunding any part of it.',
          'We may change prices for future billing periods. We will give you at least 30 days notice by email, and you may cancel before the change takes effect.']
          } />

      </LegalSection>

      <LegalSection title="6. What is not included">
        <p>
          Batchlabel is early, and the marketing pages on this site describe the product it is
          being built into. This section is the contractual position, and where the two differ
          this one governs. Some things a labelling tool is reasonably expected to do are not
          available on any plan today. They are not part of what you are buying, and we will not
          charge for them separately when they arrive.
        </p>
        <LegalList
          items={[
          'Downloading a label as a file. PDF and SVG export is in build and is not available on any plan today.',
          'Generating a UFI. We set the UFI on the label where the rules require it; the code itself currently comes from the free ECHA generator.',
          'Additional people on an account, whether editing or read only. An account is a single login on every plan.',
          'Alerts when a supplier reissues or reclassifies a safety data sheet.',
          'Bulk generation, CSV import, API access, archiving a SKU you have stopped selling, and removal of Batchlabel branding.']
          } />

        <p>
          If something is listed here, it is not sold, and no plan on the{' '}
          <Link className="underline decoration-teal-700/40 underline-offset-2" to="/pricing">pricing page</Link>{' '}
          includes it. This list is kept current, and a line leaves it when the thing it names
          ships rather than when we would like it to.
        </p>
      </LegalSection>

      <LegalSection title="7. Your content">
        <p>
          You keep ownership of everything you upload and of the label artwork you generate. You
          grant us permission to store and process your files only so far as we need to in order to
          run the service for you. We do not sell your data, and we do not use your safety data sheets
          to train models for third parties.
        </p>
      </LegalSection>

      <LegalSection title="8. Acceptable use">
        <p>
          Our{' '}
          <Link className="underline decoration-teal-700/40 underline-offset-2" to="/acceptable-use">
            acceptable use policy
          </Link>{' '}
          forms part of these terms. In short: do not break the law with our tool, do not attack the
          service, and do not resell it as your own compliance approval.
        </p>
      </LegalSection>

      <LegalSection title="9. Availability">
        <p>
          We aim to keep Batchlabel available and quick, but we do not promise uninterrupted service.
          We may suspend access for maintenance, and we will avoid busy periods where we can.
        </p>
      </LegalSection>

      <LegalSection title="10. Liability">
        <p>
          Nothing in these terms limits liability that cannot be limited by law, including for death
          or personal injury caused by negligence, or for fraud.
        </p>
        <p>
          Subject to that, and because the service produces artwork from information you control, our
          total liability to you in connection with the service is limited to the greater of the
          amount you paid us in the twelve months before the claim, or £100. We are not liable for
          loss of profit, loss of sales, loss of goodwill, regulatory penalties, product recall
          costs, marketplace delisting, or any indirect or consequential loss.
        </p>
        <p>
          If you are using Batchlabel as a consumer, you keep all your statutory rights and this
          section does not affect them.
        </p>
      </LegalSection>

      <LegalSection title="11. Ending the agreement">
        <p>
          You may stop using Batchlabel and delete your account at any time. We may suspend or close
          an account that breaches these terms or the acceptable use policy, and we will explain why
          unless we are legally prevented from doing so.
        </p>
      </LegalSection>

      <LegalSection title="12. Law and disputes">
        <p>
          These terms are governed by the law of England and Wales, and the courts of England and
          Wales have exclusive jurisdiction. If you live in Scotland or Northern Ireland, you may
          also bring proceedings in your local courts.
        </p>
      </LegalSection>

      <LegalSection title="13. Contact">
        <p>
          Questions about these terms: <a className="underline decoration-teal-700/40 underline-offset-2" href="mailto:hello@batchlabel.xyz">hello@batchlabel.xyz</a>.
        </p>
      </LegalSection>
    </LegalLayout>);

}