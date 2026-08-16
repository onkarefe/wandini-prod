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
  return [
    {title: 'Adressen'},
    {name: 'robots', content: 'noindex,follow'},
  ];
};

const NEW_ADDRESS_ID = 'NEW_ADDRESS_ID';

const ADDRESS_ERROR_MESSAGES = {
  generic:
    'Die Adressanfrage konnte derzeit nicht verarbeitet werden. Bitte versuchen Sie es erneut.',
  create:
    'Die Adresse konnte derzeit nicht angelegt werden. Bitte versuchen Sie es erneut.',
  update:
    'Die Adresse konnte derzeit nicht aktualisiert werden. Bitte versuchen Sie es erneut.',
  delete:
    'Die Adresse konnte derzeit nicht gelöscht werden. Bitte versuchen Sie es erneut.',
  unauthorized:
    'Bitte melden Sie sich erneut an, um Ihre Adressen zu verwalten.',
  invalidRequest:
    'Die Adressanfrage konnte nicht verarbeitet werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut.',
  methodNotAllowed: 'Diese Adressanfrage ist nicht zulässig.',
} as const;

function getAddressErrorMessage(_error: unknown, fallback: string) {
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
            throw new Error('Die Kundenadresse konnte nicht angelegt werden.');
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
            throw new Error('Die Kundenadresse konnte nicht aktualisiert werden.');
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
            throw new Error('Die Kundenadresse konnte nicht gelöscht werden.');
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
        <h2 className="account-addresses__title">Adressen</h2>
        {!addresses.nodes.length ? (
          <div className="account-addresses__stack">
            <div className="account-addresses__toolbar">
              <button
                className="account-addresses__button account-addresses__button--primary"
                type="button"
                onClick={() => setIsCreateOpen((current) => !current)}
              >
                {isCreateOpen
                  ? 'Formular schließen'
                  : 'Neue Adresse hinzufügen'}
              </button>
            </div>
            {isCreateOpen ? (
              <div className="account-addresses__block account-addresses__block--create">
                <legend className="account-addresses__legend">
                  Neue Adresse anlegen
                </legend>
                <NewAddressForm />
              </div>
            ) : null}
            <p className="account-addresses__empty">
              Sie haben noch keine Adressen gespeichert.
            </p>
          </div>
        ) : (
          <div className="account-addresses__stack">
            <div className="account-addresses__toolbar">
              <button
                className="account-addresses__button account-addresses__button--primary"
                type="button"
                onClick={() => setIsCreateOpen((current) => !current)}
              >
                {isCreateOpen
                  ? 'Formular schließen'
                  : 'Neue Adresse hinzufügen'}
              </button>
            </div>
            {isCreateOpen ? (
              <div className="account-addresses__block account-addresses__block--create">
                <legend className="account-addresses__legend">
                  Neue Adresse anlegen
                </legend>
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
            {stateForMethod('POST') !== 'idle'
              ? 'Wird angelegt...'
              : 'Adresse anlegen'}
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
                {stateForMethod('PUT') !== 'idle'
                  ? 'Wird gespeichert...'
                  : 'Speichern'}
              </button>
              <button
                className="account-addresses__button account-addresses__button--secondary"
                disabled={stateForMethod('DELETE') !== 'idle'}
                formMethod="DELETE"
                type="submit"
              >
                {stateForMethod('DELETE') !== 'idle'
                  ? 'Wird gelöscht...'
                  : 'Löschen'}
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
              <legend className="account-addresses__legend">
                Gespeicherte Adresse
              </legend>
              {isDefaultAddress ? (
                <span className="account-addresses__status">
                  <span className="account-addresses__status-icon" aria-hidden="true">
                    ✓
                  </span>
                  Standardadresse
                </span>
              ) : null}
            </div>
          </div>
          <input type="hidden" name="addressId" defaultValue={addressId} />
          <div className="account-addresses__grid">
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-firstName`}>
                Vorname*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Vorname"
                autoComplete="given-name"
                defaultValue={address?.firstName ?? ''}
                id={`${idPrefix}-firstName`}
                name="firstName"
                placeholder="Vorname"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-lastName`}>
                Nachname*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Nachname"
                autoComplete="family-name"
                defaultValue={address?.lastName ?? ''}
                id={`${idPrefix}-lastName`}
                name="lastName"
                placeholder="Nachname"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-company`}>
                Unternehmen
              </label>
              <input
                className="account-addresses__input"
                aria-label="Unternehmen"
                autoComplete="organization"
                defaultValue={address?.company ?? ''}
                id={`${idPrefix}-company`}
                name="company"
                placeholder="Unternehmen"
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-address1`}>
                Straße und Hausnummer*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Straße und Hausnummer"
                autoComplete="address-line1"
                defaultValue={address?.address1 ?? ''}
                id={`${idPrefix}-address1`}
                name="address1"
                placeholder="Straße und Hausnummer*"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-address2`}>
                Adresszusatz
              </label>
              <input
                className="account-addresses__input"
                aria-label="Adresszusatz"
                autoComplete="address-line2"
                defaultValue={address?.address2 ?? ''}
                id={`${idPrefix}-address2`}
                name="address2"
                placeholder="Adresszusatz"
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-city`}>
                Ort*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Ort"
                autoComplete="address-level2"
                defaultValue={address?.city ?? ''}
                id={`${idPrefix}-city`}
                name="city"
                placeholder="Ort"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-zoneCode`}>
                Bundesland / Region*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Bundesland oder Region"
                autoComplete="address-level1"
                defaultValue={address?.zoneCode ?? ''}
                id={`${idPrefix}-zoneCode`}
                name="zoneCode"
                placeholder="Bundesland / Region"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-zip`}>
                Postleitzahl*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Postleitzahl"
                autoComplete="postal-code"
                defaultValue={address?.zip ?? ''}
                id={`${idPrefix}-zip`}
                name="zip"
                placeholder="Postleitzahl"
                required
                type="text"
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-territoryCode`}>
                Ländercode*
              </label>
              <input
                className="account-addresses__input"
                aria-label="Ländercode"
                autoComplete="country"
                defaultValue={address?.territoryCode ?? ''}
                id={`${idPrefix}-territoryCode`}
                name="territoryCode"
                placeholder="Ländercode"
                required
                type="text"
                maxLength={2}
              />
            </div>
            <div className="account-addresses__field">
              <label className="account-addresses__label" htmlFor={`${idPrefix}-phoneNumber`}>
                Telefon
              </label>
              <input
                className="account-addresses__input"
                aria-label="Telefonnummer"
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
              Als Standardadresse festlegen
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
            Automatisch speichern
          </button>
        </div>
      </fieldset>
    </Form>
  );
}
