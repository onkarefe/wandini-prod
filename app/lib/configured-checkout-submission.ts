export type ConfiguredCheckoutSubmissionLock = {current: boolean};

export function claimConfiguredCheckoutSubmission(
  lock: ConfiguredCheckoutSubmissionLock,
) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseConfiguredCheckoutSubmission(
  lock: ConfiguredCheckoutSubmissionLock,
) {
  lock.current = false;
}
