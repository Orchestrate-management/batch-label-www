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

const base =
'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800',
  secondary: 'border border-ink/15 bg-white text-ink hover:border-ink/30 hover:bg-paper-deep',
  quiet: 'text-teal-700 underline decoration-teal-700/30 underline-offset-4 hover:decoration-teal-700'
};

const sizes: Record<Size, string> = {
  md: 'px-4 py-2.5 text-[0.95rem]',
  lg: 'px-5 py-3 text-base'
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