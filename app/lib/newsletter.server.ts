import {
  shopifyAdminGraphql,
  type ShopifyAdminEnv,
} from '~/lib/shopify-admin.server';

type NewsletterCustomer = {
  id: string;
  defaultEmailAddress: {marketingState: string} | null;
};

type CustomerMutation = {
  customer: NewsletterCustomer | null;
  userErrors: Array<{field: string[] | null; message: string}>;
};

const CUSTOMER_LOOKUP = `
  query NewsletterCustomer($identifier: CustomerIdentifierInput!) {
    customerByIdentifier(identifier: $identifier) {
      id
      defaultEmailAddress { marketingState }
    }
  }
`;

const CUSTOMER_UPSERT = `
  mutation NewsletterCustomerSet(
    $identifier: CustomerSetIdentifiers!
    $input: CustomerSetInput!
  ) {
    customerSet(identifier: $identifier, input: $input) {
      customer {
        id
        defaultEmailAddress { marketingState }
      }
      userErrors { field message }
    }
  }
`;

const CONSENT_UPDATE = `
  mutation NewsletterConsent($input: CustomerEmailMarketingConsentUpdateInput!) {
    customerEmailMarketingConsentUpdate(input: $input) {
      customer {
        id
        defaultEmailAddress { marketingState marketingOptInLevel }
      }
      userErrors { field message }
    }
  }
`;

function assertCustomer(
  customer: NewsletterCustomer | null | undefined,
): asserts customer is NewsletterCustomer {
  if (
    !customer ||
    typeof customer.id !== 'string' ||
    !/^gid:\/\/shopify\/Customer\/\d+$/.test(customer.id) ||
    typeof customer.defaultEmailAddress?.marketingState !== 'string'
  ) {
    throw new Error('Newsletter customer could not be resolved.');
  }
}

function assertMutation(result: CustomerMutation | null | undefined) {
  if (
    !result ||
    !Array.isArray(result.userErrors) ||
    result.userErrors.length
  ) {
    // Do not carry Shopify messages (which may contain PII) into exceptions.
    throw new Error('Newsletter customer operation failed.');
  }
  assertCustomer(result.customer);
  return result.customer;
}

// The route validates the email before invoking any Admin operation.
export async function subscribeToNewsletter(
  env: ShopifyAdminEnv,
  email: string,
) {
  const lookup = await shopifyAdminGraphql<{
    customerByIdentifier: NewsletterCustomer | null;
  }>({
    env,
    query: CUSTOMER_LOOKUP,
    variables: {identifier: {emailAddress: email}},
  });

  let customer = lookup.customerByIdentifier;
  if (customer === null) {
    // Email-based upsert also handles a customer created after the lookup.
    // No unrelated scalar or list fields are supplied or overwritten.
    const created = await shopifyAdminGraphql<{customerSet: CustomerMutation}>({
      env,
      query: CUSTOMER_UPSERT,
      variables: {identifier: {email}, input: {email}},
    });
    customer = assertMutation(created.customerSet);
  }

  assertCustomer(customer);
  // Preserve existing opt-in level and consent timestamps for subscribers.
  if (customer.defaultEmailAddress?.marketingState === 'SUBSCRIBED') return;

  const updated = await shopifyAdminGraphql<{
    customerEmailMarketingConsentUpdate: CustomerMutation & {
      customer:
        | (NewsletterCustomer & {
            defaultEmailAddress: {
              marketingState: string;
              marketingOptInLevel: string;
            };
          })
        | null;
    };
  }>({
    env,
    query: CONSENT_UPDATE,
    variables: {
      input: {
        customerId: customer.id,
        emailMarketingConsent: {
          marketingState: 'SUBSCRIBED',
          marketingOptInLevel: 'SINGLE_OPT_IN',
        },
      },
    },
  });
  const result = updated.customerEmailMarketingConsentUpdate;
  const subscribed = assertMutation(result);
  if (
    subscribed.id !== customer.id ||
    subscribed.defaultEmailAddress?.marketingState !== 'SUBSCRIBED' ||
    result.customer?.defaultEmailAddress?.marketingOptInLevel !==
      'SINGLE_OPT_IN'
  ) {
    throw new Error('Newsletter subscription was not confirmed by Shopify.');
  }
}
