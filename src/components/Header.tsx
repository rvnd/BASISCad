import { BRAND_RED } from '../app/constants';

/**
 * The BASIScad header. Black bar, white wordmark, red chevrons — the
 * frozen branding from the prototype. No buttons yet: Save / Open / New /
 * Print / Help arrive with Milestones 1 and 5, and each one must work
 * before it is added (the prototype shipped dead Settings and Help
 * buttons; this app does not).
 *
 * The chevron mark is inline SVG, not an image file, so it renders at
 * any size and needs no asset fetch.
 */
export default function Header() {
  return (
    <header className="header">
      <div className="brand" aria-label="BASIScad">
        <svg
          className="brand-chevrons"
          viewBox="0 0 32 32"
          width="28"
          height="28"
          aria-hidden="true"
        >
          <polyline
            points="5,5 15,16 5,27"
            fill="none"
            stroke={BRAND_RED}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="16,5 26,16 16,27"
            fill="none"
            stroke={BRAND_RED}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="brand-wordmark">
          <span className="brand-basis">BASIS</span>
          <span className="brand-cad">cad</span>
        </span>
      </div>
      <span className="header-status">Milestone 0 · empty workplane</span>
    </header>
  );
}
