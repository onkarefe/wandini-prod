import type {CustomerAddressInput} from '@shopify/hydrogen/customer-account-api-types';
import type {
  AddressFragment,
  CustomerFragment,
} from 'customer-accountapi.generated';
import {
  data,
  Form,
  useActionData,
  useNavigation,
  useOutletContext,
  type Fetcher,
} from 'react-router';
import {useRef, useState} from 'react';
import type {Route} from './+types/account.addresses';
import {
  UPDATE_ADDRESS_MUTATION,
  DELETE_ADDRESS_MUTATION,
  CREATE_ADDRESS_MUTATION,
} from '~/graphql/customer-account/CustomerAddressMutations';

export type ActionResponse = {
  addressId?: string | null;
  createdAddress?: AddressFragment;
  defaultAddress?: string | null;
  deletedAddress?: string | null;
  error: Record<AddressFragment['id'], string> | null;
  updatedAddress?: AddressFragment;
};

export const meta: Route.MetaFunction = () => {
  return [{title: 'Addresses'}];
};

const NEW_ADDRESS_ID = 'NEW_ADDRESS_ID';

const ADDRESS_ERROR_MESSAGES = {
  generic: 'We could not process this address request right now. Please try again.',
  create: 'We could not create this address right now. Please try again.',
  update: 'We could not update this address right now. Please try again.',
  delete: 'We could not delete this address right now. Please try again.',
  unauthorized: 'Please sign in again to manage your addresses.',
  invalidRequest: 'We could not process this address request. Please refresh and try again.',
  methodNotAllowed: 'This address request method is not allowed.',
} as const;

function getAddressErrorMessage(error: unknown, fallback: string) {
  if (import.meta.env.DEV && error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function addressErrorResponse(
  addressId: string | null | undefined,
  error: unknown,
  fallback: string,
  status = 400,
) {
  const safeAddressId = addressId || NEW_ADDRESS_ID;

  return data<ActionResponse>(
    {
      error: {
        [safeAddressId]: getAddressErrorMessage(error, fallback),
      },
    },
    {status},
  );
}

export async function loader({context}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();

  return {};
}

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;

  try {
    const form = await request.formData();

    const addressId = form.has('addressId')
      ? String(form.get('addressId'))
      : null;
    if (!addressId) {
      return addressErrorResponse(
        NEW_ADDRESS_ID,
        null,
        ADDRESS_ERROR_MESSAGES.invalidRequest,
      );
    }

    // this will ensure redirecting to login never happen for mutatation
    const isLoggedIn = await customerAccount.isLoggedIn();
    if (!isLoggedIn) {
      return addressErrorResponse(
        addressId,
        null,
        ADDRESS_ERROR_MESSAGES.unauthorized,
        401,
      );
    }

    const defaultAddress = form.has('defaultAddress')
      ? String(form.get('defaultAddress')) === 'on'
      : false;
    const address: CustomerAddressInput = {};
    const keys: (keyof CustomerAddressInput)[] = [
      'address1',
      'address2',
      'city',
      'company',
      'territoryCode',
      'firstName',
      'lastName',
      'phoneNumber',
      'zoneCode',
      'zip',
    ];

    for (const key of keys) {
      const value = form.get(key);
      if (typeof value === 'string') {
        address[key] = value;
      }
    }

    switch (request.method) {
      case 'POST': {
        // handle new address creation
        try {
          const {data, errors} = await customerAccount.mutate(
            CREATE_ADDRESS_MUTATION,
            {
              variables: {
                address,
                defaultAddress,
                language: customerAccount.i18n.language,
              },
            },
          );

          if (errors?.length) {
            throw new Error(errors[0].message);
          }

          if (data?.customerAddressCreate?.userErrors?.length) {
            throw new Error(data?.customerAddressCreate?.userErrors[0].message);
          }

          if (!data?.customerAddressCreate?.customerAddress) {
            throw new Error('Customer address create failed.');
          }

          return {
            error: null,
            createdAddress: data?.customerAddressCreate?.customerAddress,
            defaultAddress,
          };
        } catch (error: unknown) {
          return addressErrorResponse(
            addressId,
            error,
            ADDRESS_ERROR_MESSAGES.create,
          );
        }
      }

      case 'PUT': {
        // handle address updates
        try {
          const {data, errors} = await customerAccount.mutate(
            UPDATE_ADDRESS_MUTATION,
            {
              variables: {
                address,
                addressId: decodeURIComponent(addressId),
                defaultAddress,
                language: customerAccount.i18n.language,
              },
            },
          );

          if (errors?.length) {
            throw new Error(errors[0].message);
          }

          if (data?.customerAddressUpdate?.userErrors?.length) {
            throw new Error(data?.customerAddressUpdate?.userErrors[0].message);
          }

          if (!data?.customerAddressUpdate?.customerAddress) {
            throw new Error('Customer address update failed.');
          }

          return {
            error: null,
            updatedAddress: address,
            defaultAddress,
          };
        } catch (error: unknown) {
          return addressErrorResponse(
            addressId,
            error,
            ADDRESS_ERROR_MESSAGES.update,
          );
        }
      }

      case 'DELETE': {
        // handles address deletion
        try {
          const {data, errors} = await customerAccount.mutate(
            DELETE_ADDRESS_MUTATION,
            {
              variables: {
                addressId: decodeURIComponent(addressId),
                language: customerAccount.i18n.language,
              },
            },
          );

          if (errors?.length) {
            throw new Error(errors[0].message);
          }

          if (data?.customerAddressDelete?.userErrors?.length) {
            throw new Error(data?.customerAddressDelete?.userErrors[0].message);
          }

          if (!data?.customerAddressDelete?.deletedAddressId) {
            throw new Error('Customer address delete failed.');
          }

          return {error: null, deletedAddress: addressId};
        } catch (error: unknown) {
          return addressErrorResponse(
            addressId,
            error,
            ADDRESS_ERROR_MESSAGES.delete,
          );
        }
      }

      default: {
        return addressErrorResponse(
          addressId,
          null,
          ADDRESS_ERROR_MESSAGES.methodNotAllowed,
          405,
        );
      }
    }
  } catch (error: unknown) {
    return addressErrorResponse(
      NEW_ADDRESS_ID,
      error,
      ADDRESS_ERROR_MESSAGES.generic,
    );
  }
}

export default function Addresses() {
  const {customer} = useOutletContext<{customer: CustomerFragment}>();
  const {defaultAddress, addresses} = customer;
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="account-addresses">
      <section className="account-addresses__section">
        <h2 className="account-addresses__title">Addresses</h2>
        {!addresses.nodes.length ? (
          <div className="account-addresses__stack">
            <div className="account-addresses__toolbar">
              <button
                className="account-addresses__button account-addresses__button--primary"
                type="button"
                onClick={() => setIsCreateOpen((current) => !current)}
              >
                {isCreateOpen ? 'Close new address' : 'Add new address'}
              </button>
            </div>
            {isCreateOpen ? (
              <div className="account-addresses__block account-addresses__block--create">
                <legend className="account-addresses__legend">Create address</legend>
                <NewAddressForm />
              </div>
            ) : null}
            <p className="account-addresses__empty">You have no addresses saved.</p>
          </div>
        ) : (
          <div className="account-addresses__stack">
            <div className="account-addresses__toolbar">
              <button
                className="account-addresses__button account-addresses__button--primary"
                type="button"
                onClick={() => setIsCreateOpen((current) => !current)}
              >
                {isCreateOpen ? 'Close new address' : 'Add new address'}
              </button>
            </div>
            {isCreateOpen ? (
              <div className="account-addresses__block account-addresses__block--create">
                <legend className="account-addresses__legend">Create address</legend>
                <NewAddressForm />
              </div>
            ) : null}
            <ExistingAddresses
              addresses={addresses}
              defaultAddress={defaultAddress}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function NewAddressForm() {
  const newAddress = {
    address1: '',
    address2: '',
    city: '',
    company: '',
    territoryCode: '',
    firstName: '',
    id: 'new',
    lastName: '',
    phoneNumber: '',
    zoneCode: '',
    zip: '',
  } as CustomerAddressInput;

  return (
    <AddressForm
      addressId={NEW_ADDRESS_ID}
      address={newAddress}
      defaultAddress={null}
      primaryMethod="POST"
    >
      {({stateForMethod}) => (
        <div className="account-addresses__actions">
          <button
            className="account-addresses__button account-addresses__button--primary"
            disabled={stateForMethod('POST') !== 'idle'}
            formMethod="POST"
            type="submit"
          >
            {stateForMethod('POST') !== 'idle' ? 'Creating' : 'Create'}
          </button>
        </div>
      )}
    </AddressForm>
  );
}

function ExistingAddresses({
  addresses,
  defaultAddress,
}: Pick<CustomerFragment, 'addresses' | 'defaultAddress'>) {
  return (
    <div className="account-addresses__list">
      {addresses.nodes.map((address) => (
        <AddressForm
          key={address.id}
          addressId={address.id}
          address={address}
          defaultAddress={defaultAddress}
          primaryMethod="PUT"
          autoSubmitDefault
        >
          {({stateForMethod}) => (
            <div className="account-addresses__actions">
              <button
                className="account-addresses__button account-addresses__button--primary"
                disabled={stateForMethod('PUT') !== 'idle'}
                formMethod="PUT"
                type="submit"
              >
                {stateForMethod('PUT') !== 'idle' ? 'Saving' : 'Save'}
              </button>
              <button
                className="account-addresses__button account-addresses__button--secondary"
                disabled={stateForMethod('DELETE') !== 'idle'}
                formMethod="DELETE"
                type="submit"
              >
                {stateForMethod('DELETE') !== 'idle' ? 'Deleting' : 'Delete'}
              </button>
            </div>
          )}
        </AddressForm>
      ))}
    </div>
  );
}

export function AddressForm({
  addressId,
  address,
  defaultAddress,
  primaryMethod,
  autoSubmitDefault = false,
  children,
}: {
  addressId: AddressFragment['id'];
  address: CustomerAddressInput;
  defaultAddress: CustomerFragment['defaultAddress'];
  primaryMethod: 'PUT' | 'POST';
  autoSubmitDefault?: boolean;
  children: (props: {
    stateForMethod: (method: 'PUT' | 'POST' | 'DELETE') => Fetcher['state'];
  }) => React.ReactNode;
}) {
  const {state, formMethod} = useNavigation();
  const action = useActionData<ActionResponse>();
  const error = action?.error?.[addressId];
  const isDefaultAddress = defaultAddress?.id === addressId;
  const idPrefix = String(addressId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const autoSubmitRef = useRef<HTMLButtonElement>(null);
  const cardClassName = [
    'account-addresses__block',
    'account-addresses__block--card',
    isDefaultAddress ? 'is-default' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Form id={addressId} className="account-addresses__form">
      <fieldset className="account-addresses__fieldset">
        <div className={cardClassName}>
          <div className="account-addresses__card-head">
            <div className="account-addresses__card-intro">
              <legend className="account-addresses__legend">Saved address</legend>
              {isDefaultAddress ? (
                <span className="account-addresses__status">
                  <span className="account-addresses__status-icon" aria-hidden="true">
                    ✓
                  </span>
                  Default address
                </span>
              ) : null}
            </div>
          </div>
          <input type="hidden" name="addressId" defaultValue={addressId} />
          <div className="account-addresses__grid">
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-firstName`}>
                First name*
              </label>
              <input
                className="account-addresses__input"
                aria-label="First name"
                autoComplete="given-name"
                defaultValue={address?.firstName ?? ''}
                id={`${idPrefix}-firstName`}
                name="firstName"
                placeholder="First name"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-lastName`}>
                Last name*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Last name"
                autoComplete="family-name"
                defaultValue={address?.lastName ?? ''}
                id={`${idPrefix}-lastName`}
                name="lastName"
                placeholder="Last name"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-company`}>
                Company
              </label>
              <input
                className="account-addresses__input"
                aria-label="Company"
                autoComplete="organization"
                defaultValue={address?.company ?? ''}
                id={`${idPrefix}-company`}
                name="company"
                placeholder="Company"
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-address1`}>
                Address line*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Address line 1"
                autoComplete="address-line1"
                defaultValue={address?.address1 ?? ''}
                id={`${idPrefix}-address1`}
                name="address1"
                placeholder="Address line 1*"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-address2`}>
                Address line 2
              </label>
              <input
                className="account-addresses__input"
                aria-label="Address line 2"
                autoComplete="address-line2"
                defaultValue={address?.address2 ?? ''}
                id={`${idPrefix}-address2`}
                name="address2"
                placeholder="Address line 2"
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-city`}>
                City*
              </label>
              <input
                className="account-addresses__input"
                aria-label="City"
                autoComplete="address-level2"
                defaultValue={address?.city ?? ''}
                id={`${idPrefix}-city`}
                name="city"
                placeholder="City"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-zoneCode`}>
                State / Province*
              </label>
              <input
                className="account-addresses__input"
                aria-label="State/Province"
                autoComplete="address-level1"
                defaultValue={address?.zoneCode ?? ''}
                id={`${idPrefix}-zoneCode`}
                name="zoneCode"
                placeholder="State / Province"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-zip`}>
                Zip / Postal Code*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Zip"
                autoComplete="postal-code"
                defaultValue={address?.zip ?? ''}
                id={`${idPrefix}-zip`}
                name="zip"
                placeholder="Zip / Postal Code"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-territoryCode`}>
                Country Code*
              </label>
              <input
                className="account-addresses__input"
                aria-label="territoryCode"
                autoComplete="country"
                defaultValue={address?.territoryCode ?? ''}
                id={`${idPrefix}-territoryCode`}
                name="territoryCode"
                placeholder="Country"
                required
                type="text"
                maxLength={2}
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-phoneNumber`}>
                Phone
              </label>
              <input
                className="account-addresses__input"
                aria-label="Phone Number"
                autoComplete="tel"
                defaultValue={address?.phoneNumber ?? ''}
                id={`${idPrefix}-phoneNumber`}
                name="phoneNumber"
                placeholder="+16135551111"
                pattern="^\+?[1-9]\d{3,14}$"
                type="tel"
              />
            </div>
          </div>
          <div className="account-addresses__checkbox-row">
            <input
              className="account-addresses__checkbox"
              defaultChecked={isDefaultAddress}
              id={`${idPrefix}-defaultAddress`}
              name="defaultAddress"
              onChange={() => {
                if (autoSubmitDefault) {
                  autoSubmitRef.current?.click();
                }
              }}
              type="checkbox"
            />
            <label
              className="account-addresses__checkbox-label"
              htmlFor={`${idPrefix}-defaultAddress`}
            >
              Set as default address
            </label>
          </div>
          {error ? (
            <p className="account-addresses__error">
              <mark className="account-addresses__error-mark">
                <small>{error}</small>
              </mark>
            </p>
          ) : null}
          {children({
            stateForMethod: (method) => (formMethod === method ? state : 'idle'),
          })}
          <button
            ref={autoSubmitRef}
            className="account-addresses__auto-submit"
            formMethod={primaryMethod}
            tabIndex={-1}
            type="submit"
          >
            Auto submit
          </button>
        </div>
      </fieldset>
    </Form>
  );
}
