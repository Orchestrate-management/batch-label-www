import React, { useState } from 'react';
import { MailIcon, ClockIcon, MapPinIcon } from 'lucide-react';
import { usePageMeta, useStructuredData } from '../lib/seo';
import { breadcrumbSchema, graph } from '../lib/structured-data';
import { PageHero } from '../components/PageHero';
import { Section } from '../components/ui/Section';
import { Field, Alert } from '../components/ui/Field';
import { Button } from '../components/ui/Button';

export function Contact() {
  usePageMeta({
    title: 'Contact us about CLP labelling or your account',
    description:
    'Email hello@batchlabel.xyz with a question about CLP labelling or your Batchlabel account. A person replies, usually the same working day.'
  });

  useStructuredData(graph([breadcrumbSchema('Contact', '/contact')]));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // TODO: post to your support inbox or helpdesk endpoint. Until then this opens the
    // maker's email client so no message is lost.
    const body = encodeURIComponent(`${message}\n\nFrom: ${name} (${email})`);
    window.location.href = `mailto:hello@batchlabel.xyz?subject=${encodeURIComponent(
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
        <div className="grid gap-12 lg:grid-cols-[1fr_0.8fr] lg:gap-16">
          {/* Both halves of this page had cards with their own headings but no heading of
              their own, which left the h1 with three unrelated h2 siblings and no way to
              tell the form apart from the contact details. The two headings are visually
              hidden because the layout already makes the split obvious to a sighted
              reader. */}
          <form
            onSubmit={handleSubmit}
            className="space-y-4"
            aria-labelledby="contact-form-heading"
            noValidate>

            <h2 id="contact-form-heading" className="sr-only">
              Send us a message
            </h2>
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
                className="w-full rounded-xl border border-ink-line bg-white px-3.5 py-3 text-[0.97rem] leading-relaxed text-ink" />
              
            </div>
            <Button type="submit" track={{ label: 'Send message', location: 'contact_form' }}>
              Send message
            </Button>
            {sent ?
            <Alert tone="success">
                Thanks. Your email client should have opened. If it did not, write to
                hello@batchlabel.xyz and we will pick it up.
              </Alert> :
            null}
          </form>

          <div className="space-y-4">
            <h2 className="sr-only">Other ways to reach us</h2>
            <DetailCard icon={<MailIcon size={18} aria-hidden="true" />} title="Email">
              <a href="mailto:hello@batchlabel.xyz" className="bl-link font-mono text-[0.92rem] text-teal-700">
                hello@batchlabel.xyz
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
    <div className="bl-tag border border-paper-edge bg-white p-6 shadow-card">
      <div className="flex items-center gap-2 text-clay-600">{icon}</div>
      <h3 className="mt-3 font-display text-[1.08rem] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-[0.92rem] leading-[1.7] text-ink-soft">{children}</p>
    </div>);

}