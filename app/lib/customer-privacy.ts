type CustomerPrivacyPermissionApi = {
  analyticsProcessingAllowed: () => boolean;
  marketingAllowed: () => boolean;
};

export function allowsThirdPartyTracking(
  customerPrivacy?: CustomerPrivacyPermissionApi | null,
) {
  return Boolean(
    customerPrivacy?.analyticsProcessingAllowed() &&
      customerPrivacy.marketingAllowed(),
  );
}
