import { useState } from 'react';
import { loadRuntimeConfig } from '../config';

/**
 * PLANTED FAULT #1 (runtime-toggleable via config.faultsEnabled):
 * demonstrates Faro's uncaught-error reporting + FaroErrorBoundary.
 *
 * The error is thrown from *render*, not the onClick handler directly —
 * React error boundaries (Faro's included) only intercept errors thrown
 * during rendering/lifecycle/constructors, never inside event handlers. So
 * the click just flips `broken` to true; the resulting re-render is what
 * throws, and that's what FaroErrorBoundary (mounted at the app root, see
 * main.tsx) catches: it reports the error to Faro *before* swallowing it and
 * rendering its fallback, which is the behavior we want to demonstrate.
 */
export function LensCareGuidePage() {
  const [broken, setBroken] = useState(false);
  const faultsEnabled = loadRuntimeConfig().faultsEnabled;

  if (broken) {
    throw new Error('Lens Care Guide: eyepiece coating chart failed to load (planted fault #1)');
  }

  return (
    <div className="lens-care-guide">
      <h2>Lens Care Guide</h2>
      <p>Keep your optics pristine with a few simple habits:</p>
      <ul>
        <li>Always use a lens cap when the instrument isn't in use.</li>
        <li>Blow away loose dust before ever touching a lens with a cloth.</li>
        <li>Use only optical-grade microfiber or lens tissue — never a shirt sleeve.</li>
        <li>Store telescopes and binoculars somewhere dry to avoid fungus growth on the coatings.</li>
      </ul>
      <button
        onClick={() => {
          if (faultsEnabled) {
            setBroken(true);
          } else {
            alert('The eyepiece coating chart would normally load here (faults are disabled in this environment).');
          }
        }}
      >
        Load detailed coating chart
      </button>
    </div>
  );
}
