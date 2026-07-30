import React, { useState } from 'react';
import { MailIcon, ClockIcon, MapPinIcon } from 'lucide-react';
import { usePageMeta } from '../lib/seo';
import { PageHero } from '../components/PageHero';
import { Section } from '../components/ui/Section';
import { Field, Alert } from '../components/ui/Field';
import { Button } from '../components/ui/Button';

export function Contact() {
  usePageMeta({
    title: 'Contact us',
    description:
    'Email hello@batchlabel.co.uk with a question about CLP labelling or your Batchlabel account. A person replies, usually the same working day.'
  });

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // TODO: post to your support inbox or helpdesk endpoint. Until then this opens the
    // maker's email client so no message is lost.
    const body = encodeURIComponent(`${message}\n\nFrom: ${name} (${email})`);
    window.location.href = `mailto:hello@batchlabel.co.uk?subject=${encodeURIComponent(
      'Question from the Batchlabel site'
    )}&body=${body}`;
    setSent(true);
  };

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="Talk to a person"
        intro="Questions about a safety data sheet, your account or the bill all come to the same inbox." />
      

      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr]">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <Field
              label="Your name"
              name="name"
              value={name}
              onChange={setName}
              required
              autoComplete="name" />
            
            <Field
              label="Email"
              name="email"
              type="email"
              value={email}
              onChange={setEmail}
              required
              autoComplete="email"
              hint="We reply to this address and nothing else." />
            
            <div className="space-y-1.5">
              <label htmlFor="message" className="block text-sm font-medium text-ink">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={6}
                required
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-[0.97rem] text-ink" />
              
            </div>
            <Button type="submit" track={{ label: 'Send message', location: 'contact_form' }}>
              Send message
            </Button>
            {sent ?
            <Alert tone="success">
                Thanks. Your email client should have opened. If it did not, write to
                hello@batchlabel.co.uk and we will pick it up.
              </Alert> :
            null}
          </form>

          <div className="space-y-4">
            <DetailCard icon={<MailIcon size={18} aria-hidden="true" />} title="Email">
              <a
                href="mailto:hello@batchlabel.co.uk"
                className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
                
                hello@batchlabel.co.uk
              </a>
            </DetailCard>
            <DetailCard icon={<ClockIcon size={18} aria-hidden="true" />} title="Replies">
              Monday to Friday, 9am to 5pm UK time. Usually the same working day.
            </DetailCard>
            <DetailCard icon={<MapPinIcon size={18} aria-hidden="true" />} title="Registered office">
              Orchestrate Technologies Ltd, 167-169 Great Portland Street, London W1W 5PF. Post is
              slower than email.
            </DetailCard>
            <p className="text-sm leading-relaxed text-ink-muted">
              We cannot give legal advice or confirm that a specific label meets your obligations.
              We can explain what Batchlabel produces and where each line comes from.
            </p>
          </div>
        </div>
      </Section>
    </>);

}

function DetailCard({
  icon,
  title,
  children




}: {icon: React.ReactNode;title: string;children: React.ReactNode;}) {
  return (
    <div className="rounded-2xl border border-paper-edge bg-white p-5">
      <div className="flex items-center gap-2 text-teal-700">{icon}</div>
      <h2 className="mt-2 font-display text-[1.02rem] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</p>
    </div>);

}