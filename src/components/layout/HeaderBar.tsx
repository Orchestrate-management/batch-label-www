import React from 'react';
import { Logo } from './Logo';

/**
 * The one header geometry on the site.
 *
 * There used to be three headers — the marketing bar, the auth shell's logo bar and the
 * dashboard bar — each with its own padding and its own row height, all rendering the
 * same mark in a different place. Measured at 1280x900, the lockup sat at x=152, y=19.13
 * on the marketing pages and x=128, y=12.00 on /sign-up, so it jumped 24px left and 7.1px
 * up the moment anyone clicked "Make a label free". Two independent faults:
 *
 * 1. Horizontal. The marketing bar put its horizontal padding on the inner max-w-5xl
 *    box. The auth bar put it on the full-width <header> and centred an unpadded
 *    max-w-5xl box inside what was left. Once the viewport is wider than the container
 *    those are not the same place — they differ by exactly one gutter, 24px from the sm
 *    breakpoint up. Below ~1072px they happen to agree, which is why it looked fine on a
 *    phone and wrong on a laptop.
 *
 * 2. Vertical. The marketing row's height was set by the call-to-action button (63.8px
 *    of content) and the auth row's by the logo's line box (34.3px), so the row with no
 *    button was 8.5px shorter and centred its logo 7.1px higher.
 *
 * Both are fixed here rather than in three places: one padded container, and a reserved
 * row height so a header with no button is exactly as tall as one with a button. The
 * variants differ only in what sits to the right of the mark.
 */

/**
 * Reserved height of the logo row, padding included.
 *
 * The tallest thing any variant puts in this row is the marketing call-to-action, which
 * measures 63.8px inside the 10px of vertical padding. 68px leaves ~4px of headroom, so
 * the row height is a constant rather than a function of whichever variant is rendered —
 * which is the whole point. Change this and the mark moves on every route at once.
 *
 * Brand pack rule (public/brand/README.md): clear space is half the mark height on every
 * side, minimum 16px. The mark is 28px, so the floor is 16px. 68px reserved against a
 * 28.55px lockup leaves 19.72px above and below.
 *
 * WIDTH. max-w-6xl, not max-w-5xl. The measure has to be the same box every band under it
 * uses — see GUTTER and Section in components/ui/Section.tsx — or the mark sits inboard of
 * the first word of every heading on the page. The two are asserted to agree in
 * HeaderBar.test.tsx; if one moves the other has to move with it.
 */
export const HEADER_ROW_CLASS =
'mx-auto flex min-h-[4.25rem] w-full max-w-6xl items-center justify-between gap-4 px-5 py-2.5 sm:px-6';

/**
 * Sticky everywhere, deliberately. It used to be sticky on marketing and static on auth
 * and the dashboard, which was an accident of which layout you happened to be in rather
 * than a decision. The mark is the way back on every route, so it stays reachable on all
 * of them.
 *
 * bg-paper/95 everywhere too. The dashboard header was bg-white sitting on a bg-paper
 * page, which drew a hard slab across the top and made the marketing → auth → dashboard
 * boundary read as three different products.
 */
export const HEADER_SHELL_CLASS =
'sticky top-0 z-40 border-b border-paper-edge bg-paper/85 backdrop-blur-md backdrop-saturate-150';

interface HeaderBarProps {
  /**
   * Sits to the right of the mark. Omit it entirely for the minimal variant the auth
   * pages use — the row keeps its height either way.
   */
  children?: React.ReactNode;
  /**
   * A second row inside the same <header>: the dashboard's tabs, the marketing site's
   * mobile nav panel. Kept inside so there is still exactly one banner landmark.
   */
  below?: React.ReactNode;
}

export function HeaderBar({ children, below }: HeaderBarProps) {
  return (
    <header className={HEADER_SHELL_CLASS}>
      {/* data-header-row is how HeaderBar.test.tsx proves the three shells share this
          box. It is the assertion that would have caught the original bug. */}
      <div data-header-row="" className={HEADER_ROW_CLASS}>
        <Logo />
        {children}
      </div>
      {below}
    </header>);

}
