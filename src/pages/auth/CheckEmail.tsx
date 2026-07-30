import { Link, useSearchParams } from 'react-router-dom';
import { MailCheckIcon } from 'lucide-react';
import { usePageMeta } from '../../lib/seo';
import { AuthShell } from '../../components/auth/AuthShell';

export function CheckEmail() {
  usePageMeta({
    title: 'Check your email',
    description: 'We have sent you a link to confirm your Batchlabel account.',
    noIndex: true
  });

  const [params] = useSearchParams();
  const email = params.get('email');
  const mode = params.get('mode');

  return (
    <AuthShell
      title="Check your email"
      intro={
      mode === 'magic_link' ?
      'We have sent you a link that signs you straight in. No password to remember.' :
      'We have sent you a link to confirm your address. One click and your account is live.'
      }
      footer={
      <p>
          Wrong address?{' '}
          <Link to="/sign-up" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Start again
          </Link>
        </p>
      }>
      
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-teal-600/25 bg-teal-50 px-4 py-3">
          <MailCheckIcon size={20} className="mt-0.5 shrink-0 text-teal-800" aria-hidden="true" />
          <p className="text-sm text-teal-800">
            Sent to <span className="font-medium">{email ?? 'your email address'}</span>. The link is
            valid for one hour.
          </p>
        </div>

        <ol className="space-y-2 text-sm leading-relaxed text-ink-soft">
          <li>1. Open the email from Batchlabel.</li>
          <li>2. Tap the link. It opens your dashboard.</li>
          <li>3. Have your fragrance supplier safety data sheet ready and make your first label.</li>
        </ol>

        <p className="text-sm text-ink-muted">
          Nothing after a few minutes? Check spam, and check the address above is right. Still stuck,
          email{' '}
          <a
            href="mailto:hello@batchlabel.co.uk"
            className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            
            hello@batchlabel.co.uk
          </a>
          .
        </p>
      </div>
    </AuthShell>);

}