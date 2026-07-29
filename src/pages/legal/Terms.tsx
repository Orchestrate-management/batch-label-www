import React from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { LegalLayout, LegalSection, LegalList } from '../../components/legal/LegalLayout';

export function Terms() {
  usePageMeta({
    title: 'Terms of service',
    description:
    'The terms on which you use Batchlabel, including what the label generator does, the limits of our role, subscriptions, cancellation and liability.'
  });

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
          'We do not carry out a chemical safety assessment, a classification review by a qualified toxicologist, or a Cosmetic Product Safety Report.',
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
          account. Accounts are for one business, and the Maker plan allows up to five named people
          within that business.
        </p>
      </LegalSection>

      <LegalSection title="5. Plans, prices and payment">
        <LegalList
          items={[
          'The Free plan allows one watermarked label and requires no payment card.',
          'The Maker plan is £14 per month or £140 per year. Prices shown on the site are inclusive of VAT for consumers. VAT registered businesses may enter a VAT number at checkout, and Stripe Tax will apply the correct treatment on the invoice.',
          'Payments are handled by Stripe. We never see or store your full card details.',
          'Subscriptions renew automatically until cancelled. You can cancel at any time through the billing portal in your dashboard, and you keep access until the end of the period you have paid for.',
          'If Batchlabel does not do what the pricing page describes, tell us within 14 days of payment and we will refund you in full if we cannot put it right. Annual plans cancelled part way through are refunded pro rata on request.',
          'We may change prices for future billing periods. We will give you at least 30 days notice by email, and you may cancel before the change takes effect.']
          } />
        
      </LegalSection>

      <LegalSection title="6. Your content">
        <p>
          You keep ownership of everything you upload and of the label artwork you generate. You
          grant us permission to store and process your files only so far as we need to in order to
          run the service for you. We do not sell your data, and we do not use your safety data sheets
          to train models for third parties.
        </p>
      </LegalSection>

      <LegalSection title="7. Acceptable use">
        <p>
          Our{' '}
          <Link className="underline decoration-teal-700/40 underline-offset-2" to="/acceptable-use">
            acceptable use policy
          </Link>{' '}
          forms part of these terms. In short: do not break the law with our tool, do not attack the
          service, and do not resell it as your own compliance approval.
        </p>
      </LegalSection>

      <LegalSection title="8. Availability">
        <p>
          We aim to keep Batchlabel available and quick, but we do not promise uninterrupted service.
          We may suspend access for maintenance, and we will avoid busy periods where we can.
        </p>
      </LegalSection>

      <LegalSection title="9. Liability">
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

      <LegalSection title="10. Ending the agreement">
        <p>
          You may stop using Batchlabel and delete your account at any time. We may suspend or close
          an account that breaches these terms or the acceptable use policy, and we will explain why
          unless we are legally prevented from doing so.
        </p>
      </LegalSection>

      <LegalSection title="11. Law and disputes">
        <p>
          These terms are governed by the law of England and Wales, and the courts of England and
          Wales have exclusive jurisdiction. If you live in Scotland or Northern Ireland, you may
          also bring proceedings in your local courts.
        </p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>
          Questions about these terms: <a className="underline decoration-teal-700/40 underline-offset-2" href="mailto:hello@batchlabel.co.uk">hello@batchlabel.co.uk</a>.
        </p>
      </LegalSection>
    </LegalLayout>);

}