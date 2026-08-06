import React from 'react';
import { Link } from 'react-router-dom';
import { twMerge } from 'tailwind-merge';
import { trackCtaClick } from '../../lib/analytics';

type Variant = 'primary' | 'secondary' | 'quiet';
type Size = 'md' | 'lg';

interface CommonProps {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  /** When set, a cta_click event is pushed to the dataLayer before navigating. */
  track?: {label: string;location: string;};
  fullWidth?: boolean;
}

interface LinkProps extends CommonProps {
  to: string;
  href?: never;
  type?: never;
  disabled?: never;
  onClick?: () => void;
}

interface AnchorProps extends CommonProps {
  href: string;
  to?: never;
  type?: never;
  disabled?: never;
  onClick?: () => void;
}

interface ButtonProps extends CommonProps {
  to?: never;
  href?: never;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * min-h is the touch target rather than the padding. WCAG 2.5.8 asks for 24px and the
 * practical floor on a phone is 44px, which a text button set at 0.95rem inside 10px of
 * vertical padding does not reach on its own.
 */
const base =
'inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-xl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-60 motion-safe:active:translate-y-px';

const variants: Record<Variant, string> = {
  primary:
  'bg-teal-700 text-white shadow-[0_1px_0_rgba(30,27,24,0.06),0_10px_20px_-14px_rgba(15,61,59,0.9)] hover:bg-teal-800',
  // border-ink-line at full strength, not ink/15 and not ink-line/70. A secondary button
  // is card white sitting on warm paper, and those two differ by 1.06:1 — the border IS
  // the control boundary, so WCAG 1.4.11 wants 3:1 for it. ink-line measures 3.54:1 on
  // card white and 3.25:1 on paper. ink/15 measured 1.35:1 and ink-line/70 about 2.5:1.
  secondary: 'border border-ink-line bg-white text-ink hover:border-ink hover:bg-paper-deep',
  quiet: 'bl-link min-h-0 text-teal-700'
};

const sizes: Record<Size, string> = {
  md: 'px-4 py-2.5 text-[0.95rem]',
  lg: 'px-6 py-3.5 text-[1.02rem]'
};

function classesFor({ variant = 'primary', size = 'md', fullWidth, className }: CommonProps) {
  return twMerge(
    base,
    variants[variant],
    variant === 'quiet' ? 'px-0 py-0' : sizes[size],
    fullWidth ? 'w-full' : '',
    className
  );
}

export function Button(props: LinkProps | AnchorProps | ButtonProps) {
  const { children, track, onClick } = props;

  const handleClick = () => {
    if (track) trackCtaClick(track.label, track.location);
    onClick?.();
  };

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} className={classesFor(props)} onClick={handleClick}>
        {children}
      </Link>);

  }

  if ('href' in props && props.href) {
    return (
      <a href={props.href} className={classesFor(props)} onClick={handleClick}>
        {children}
      </a>);

  }

  const { type = 'button', disabled } = props as ButtonProps;
  return (
    <button type={type} disabled={disabled} className={classesFor(props)} onClick={handleClick}>
      {children}
    </button>);

}