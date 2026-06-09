/** Working payout cadence: distributions land ~every 10 days. The real cycle
 *  boundary always comes from the distribution message; this only powers the
 *  "next payment ~in N days" estimate and the progress bar. */
export const CYCLE_LENGTH_SEC = 10 * 24 * 60 * 60;

/** Estimated next payout = last cycle end + one cadence. */
export function nextPaymentEstimate(cycleEndSec: number): number {
  return cycleEndSec + CYCLE_LENGTH_SEC;
}

/** Fraction of the current cycle elapsed, clamped to [0,1]. */
export function cycleProgress(startSec: number, nextSec: number, nowSec: number): number {
  const span = nextSec - startSec;
  if (span <= 0) return 1;
  const p = (nowSec - startSec) / span;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}
