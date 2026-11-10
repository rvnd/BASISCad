import { BRAND_RED } from '../app/constants';
export default function Brand() {
  return (
    <div className="brand" aria-label="BASIScad">
      <svg className="brand-chevrons" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
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
  );
}
