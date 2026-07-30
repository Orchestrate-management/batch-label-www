import { Button } from './ui/Button';

interface CtaBandProps {
  heading?: string;
  body?: string;
  location: string;
}

export function CtaBand({
  heading = 'Make your first label tonight',
  body = 'Free, and no card needed. If it does not handle your fragrance properly, you have lost ten minutes.',
  location
}: CtaBandProps) {
  return (
    <section className="bl-grain bl-reversed bg-teal-800 px-5 py-14 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h2 className="font-display text-[1.7rem] font-semibold leading-tight tracking-[-0.015em] text-white sm:text-[2.15rem]">
          {heading}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[1.02rem] leading-relaxed text-teal-100">{body}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            to="/sign-up"
            size="lg"
            className="bg-white text-teal-800 hover:bg-paper-deep"
            track={{ label: 'Make a label free', location }}>
            
            Make a label free
          </Button>
          <Button
            to="/pricing"
            size="lg"
            variant="secondary"
            className="border-white/30 bg-transparent text-white hover:border-white/60 hover:bg-white/10"
            track={{ label: 'See pricing', location }}>
            
            See pricing
          </Button>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-teal-100/80">
          Batchlabel builds labels against published CLP requirements from the details you provide.
          The final label remains your responsibility as the seller.
        </p>
      </div>
    </section>);

}