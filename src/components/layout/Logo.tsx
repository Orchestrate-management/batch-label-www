import { Link } from 'react-router-dom';

export function Logo({ className = '' }: {className?: string;}) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 font-display text-[1.05rem] font-semibold tracking-[-0.01em] text-ink ${className}`}>
      
      <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true" focusable="false">
        <rect x="1" y="1" width="26" height="26" rx="8" fill="#134F49" />
        <path
          d="M9 19.5V8.5h5a3 3 0 0 1 0 6H9m0 0h5.6a3 3 0 0 1 0 6H9"
          stroke="#FBF8F3"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none" />
        
      </svg>
      <span>
        Batchlabel
        <span className="sr-only">, home</span>
      </span>
    </Link>);

}