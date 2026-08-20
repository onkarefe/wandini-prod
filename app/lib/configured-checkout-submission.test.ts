import {describe, expect, it} from 'vitest';
import {
  claimConfiguredCheckoutSubmission,
  releaseConfiguredCheckoutSubmission,
} from '~/lib/configured-checkout-submission';

describe('configured checkout submission lock', () => {
  it('claims the first submission and rejects an accidental repeat', () => {
    const lock = {current: false};

    expect(claimConfiguredCheckoutSubmission(lock)).toBe(true);
    expect(claimConfiguredCheckoutSubmission(lock)).toBe(false);
  });

  it('can be released after a recoverable failure', () => {
    const lock = {current: false};

    claimConfiguredCheckoutSubmission(lock);
    releaseConfiguredCheckoutSubmission(lock);

    expect(claimConfiguredCheckoutSubmission(lock)).toBe(true);
  });
});
