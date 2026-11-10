import { useEffect, useState } from 'react';
import { GUIDE_STEPS } from '../app/guide';

export default function FirstUseGuide({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = GUIDE_STEPS[index]!;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <section className="first-use-guide" role="region" aria-label="First-use guide">
      <div className="guide-heading">
        <span>
          Quick start · Step {index + 1} of {GUIDE_STEPS.length}
        </span>
        <button type="button" aria-label="Close guide" onClick={onClose}>
          ×
        </button>
      </div>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="guide-actions">
        <button type="button" onClick={onClose}>
          Skip guide
        </button>
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          Back
        </button>
        <button
          type="button"
          onClick={() => (index === GUIDE_STEPS.length - 1 ? onClose() : setIndex(index + 1))}
        >
          {index === GUIDE_STEPS.length - 1 ? 'Done' : 'Next'}
        </button>
      </div>
    </section>
  );
}
