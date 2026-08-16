import type {CustomerAddressInput} from '@shopify/hydrogen/customer-account-api-types';
import type {
  AddressFragment,
  CustomerFragment,
} from 'customer-accountapi.generated';
import {
  data,
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
  type Fetcher,
} from 'react-router';
import {useEffect, useRef, useState} from 'react';
import type {Route} from './+types/account.addresses';
import {
  UPDATE_ADDRESS_MUTATION,
  DELETE_ADDRESS_MUTATION,
  CREATE_ADDRESS_MUTATION,
} from '~/graphql/customer-account/CustomerAddressMutations';
import {CUSTOMER_DETAILS_QUERY} from '~/graphql/customer-account/CustomerDetailsQuery';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';

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
    {name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE},
  ];
};

const NEW_ADDRESS_ID = 'NEW_ADDRESS_ID';

const EUROPEAN_COUNTRIES = [
  ['AL', 'Albanien'],
  ['AD', 'Andorra'],
  ['AM', 'Armenien'],
  ['AZ', 'Aserbaidschan'],
  ['BE', 'Belgien'],
  ['BA', 'Bosnien und Herzegowina'],
  ['BG', 'Bulgarien'],
  ['DK', 'Dänemark'],
  ['DE', 'Deutschland'],
  ['EE', 'Estland'],
  ['FI', 'Finnland'],
  ['FR', 'Frankreich'],
  ['GE', 'Georgien'],
  ['GR', 'Griechenland'],
  ['GB', 'Großbritannien'],
  ['IE', 'Irland'],
  ['IS', 'Island'],
  ['IT', 'Italien'],
  ['XK', 'Kosovo'],
  ['HR', 'Kroatien'],
  ['LV', 'Lettland'],
  ['LI', 'Liechtenstein'],
  ['LT', 'Litauen'],
  ['LU', 'Luxemburg'],
  ['MT', 'Malta'],
  ['MD', 'Moldau'],
  ['MC', 'Monaco'],
  ['ME', 'Montenegro'],
  ['NL', 'Niederlande'],
  ['MK', 'Nordmazedonien'],
  ['NO', 'Norwegen'],
  ['AT', 'Österreich'],
  ['PL', 'Polen'],
  ['PT', 'Portugal'],
  ['RO', 'Rumänien'],
  ['SM', 'San Marino'],
  ['SE', 'Schweden'],
  ['CH', 'Schweiz'],
  ['RS', 'Serbien'],
  ['SK', 'Slowakei'],
  ['SI', 'Slowenien'],
  ['ES', 'Spanien'],
  ['CZ', 'Tschechien'],
  ['TR', 'Türkei'],
  ['UA', 'Ukraine'],
  ['HU', 'Ungarn'],
  ['VA', 'Vatikanstadt'],
  ['BY', 'Weißrussland'],
  ['CY', 'Zypern'],
] as const;

const EUROPEAN_COUNTRY_NAMES = new Map<string, string>(EUROPEAN_COUNTRIES);

function getCountryName(countryCode?: string | null) {
  return EUROPEAN_COUNTRY_NAMES.get(countryCode ?? '') ?? countryCode ?? '';
}

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
  const {customerAccount} = context;
  const {data: queryData, errors} = await customerAccount.query(
    CUSTOMER_DETAILS_QUERY,
    {
      variables: {
        language: customerAccount.i18n.language,
      },
    },
  );

  if (errors?.length || !queryData?.customer) {
    throw new Response('Kundenadressen nicht gefunden', {status: 404});
  }

  return {customer: queryData.customer};
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
        const trimmedValue = value.trim();

        if (!trimmedValue && request.method !== 'PUT') {
          continue;
        }

        if (!trimmedValue && (key === 'phoneNumber' || key === 'zoneCode')) {
          continue;
        }

        address[key] =
          key === 'territoryCode' || key === 'zoneCode'
            ? trimmedValue.toUpperCase()
            : trimmedValue;
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
            addressId,
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
            throw new Error(
              'Die Kundenadresse konnte nicht aktualisiert werden.',
            );
          }

          return {
            addressId,
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

          return {addressId, error: null, deletedAddress: addressId};
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
  const {customer} = useLoaderData<typeof loader>();
  const {defaultAddress, addresses} = customer;
  const action = useActionData<ActionResponse>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (action?.createdAddress && !action.error) {
      setIsCreateOpen(false);
    }
  }, [action]);

  return (
    <div className="account-page account-addresses">
      <header className="account-page__header">
        <div>
          <p className="account-page__eyebrow">Lieferinformationen</p>
          <h2 className="account-page__title">Adressen</h2>
          <p className="account-page__description">
            Verwalten Sie Ihre Lieferadressen für eine schnellere Bestellung.
          </p>
        </div>
        <button
          className="account-button account-button--primary"
          type="button"
          aria-controls={NEW_ADDRESS_ID}
          aria-expanded={isCreateOpen}
          onClick={() => setIsCreateOpen((current) => !current)}
        >
          {isCreateOpen ? 'Formular schließen' : 'Neue Adresse'}
        </button>
      </header>

      <section className="account-addresses__section">
        <div className="account-addresses__stack">
          {isCreateOpen ? <NewAddressForm /> : null}

          {addresses.nodes.length ? (
            <ExistingAddresses
              addresses={addresses}
              defaultAddress={defaultAddress}
            />
          ) : isCreateOpen ? null : (
            <div className="account-empty-state">
              <h3>Noch keine Adresse</h3>
              <p>
                Fügen Sie eine Lieferadresse hinzu, damit sie bei Ihrer nächsten
                Bestellung verfügbar ist.
              </p>
            </div>
          )}
        </div>
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
    territoryCode: 'DE',
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
            className="account-button account-button--primary"
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
          {({stateForMethod, closeEditor}) => (
            <div className="account-addresses__actions">
              <button
                className="account-button account-button--primary"
                disabled={stateForMethod('PUT') !== 'idle'}
                formMethod="PUT"
                type="submit"
              >
                {stateForMethod('PUT') !== 'idle'
                  ? 'Wird gespeichert...'
                  : 'Speichern'}
              </button>
              <button
                className="account-button account-button--secondary"
                disabled={stateForMethod('PUT') !== 'idle'}
                type="button"
                onClick={closeEditor}
              >
                Abbrechen
              </button>
              <button
                className="account-button account-button--danger"
                disabled={stateForMethod('DELETE') !== 'idle'}
                formMethod="DELETE"
                type="submit"
                onClick={(event) => {
                  if (
                    !window.confirm(
                      'Möchten Sie diese Adresse wirklich löschen?',
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
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
    closeEditor: () => void;
  }) => React.ReactNode;
}) {
  const {state, formMethod, formData} = useNavigation();
  const action = useActionData<ActionResponse>();
  const error = action?.error?.[addressId];
  const isDefaultAddress = defaultAddress?.id === addressId;
  const isNewAddress = primaryMethod === 'POST';
  const [isEditing, setIsEditing] = useState(isNewAddress);
  const idPrefix = String(addressId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const autoSubmitRef = useRef<HTMLButtonElement>(null);
  const selectedCountryCode = String(address?.territoryCode ?? 'DE');
  const hasEuropeanCountry = EUROPEAN_COUNTRY_NAMES.has(selectedCountryCode);
  const fullName = [address?.firstName, address?.lastName]
    .filter(Boolean)
    .join(' ');
  const isCurrentSubmission = formData?.get('addressId') === addressId;
  const isPending = isCurrentSubmission && state !== 'idle';
  const formClassName = [
    'account-addresses__form',
    isEditing ? 'is-editing' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const cardClassName = [
    'account-addresses__block',
    'account-addresses__block--card',
    isDefaultAddress ? 'is-default' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (
      !isNewAddress &&
      action?.addressId === addressId &&
      action.updatedAddress &&
      !action.error &&
      state === 'idle'
    ) {
      setIsEditing(false);
    }
  }, [action, addressId, isNewAddress, state]);

  const stateForMethod = (method: 'PUT' | 'POST' | 'DELETE') =>
    isCurrentSubmission && formMethod === method ? state : 'idle';

  return (
    <Form id={addressId} className={formClassName} aria-busy={isPending}>
      <fieldset className="account-addresses__fieldset" disabled={isPending}>
        <legend className="account-sr-only">
          {isNewAddress ? 'Neue Adresse' : 'Gespeicherte Adresse'}
        </legend>
        <div className={cardClassName}>
          <div className="account-addresses__card-head">
            <div className="account-addresses__card-intro">
              <h3 className="account-addresses__legend">
                {isNewAddress
                  ? 'Neue Adresse'
                  : isEditing
                    ? 'Adresse bearbeiten'
                    : fullName || 'Gespeicherte Adresse'}
              </h3>
              {isDefaultAddress ? (
                <span className="account-addresses__status">
                  Standardadresse
                </span>
              ) : null}
            </div>
          </div>
          <input type="hidden" name="addressId" defaultValue={addressId} />

          {!isEditing ? (
            <>
              <address className="account-addresses__summary">
                {address?.company ? <span>{address.company}</span> : null}
                {fullName ? <span>{fullName}</span> : null}
                {address?.address1 ? <span>{address.address1}</span> : null}
                {address?.address2 ? <span>{address.address2}</span> : null}
                {address?.zip || address?.city ? (
                  <span>
                    {[address.zip, address.city].filter(Boolean).join(' ')}
                  </span>
                ) : null}
                {address?.zoneCode ? <span>{address.zoneCode}</span> : null}
                {address?.territoryCode ? (
                  <span>{getCountryName(String(address.territoryCode))}</span>
                ) : null}
                {address?.phoneNumber ? (
                  <span>{address.phoneNumber}</span>
                ) : null}
              </address>
              <div className="account-addresses__actions">
                <button
                  className="account-button account-button--secondary"
                  type="button"
                  onClick={() => setIsEditing(true)}
                >
                  Bearbeiten
                </button>
                <button
                  className="account-button account-button--text-danger"
                  disabled={stateForMethod('DELETE') !== 'idle'}
                  formMethod="DELETE"
                  type="submit"
                  onClick={(event) => {
                    if (
                      !window.confirm(
                        'Möchten Sie diese Adresse wirklich löschen?',
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  {stateForMethod('DELETE') !== 'idle'
                    ? 'Wird gelöscht...'
                    : 'Löschen'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="account-addresses__grid">
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-firstName`}
                  >
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
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-lastName`}
                  >
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
                <div className="account-addresses__field account-addresses__field--wide">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-company`}
                  >
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
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-address1`}
                  >
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
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-address2`}
                  >
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
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-zip`}
                  >
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
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-city`}
                  >
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
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-territoryCode`}
                  >
                    Land*
                  </label>
                  <select
                    className="account-addresses__input"
                    aria-label="Land"
                    autoComplete="country"
                    defaultValue={selectedCountryCode}
                    id={`${idPrefix}-territoryCode`}
                    name="territoryCode"
                    required
                  >
                    <option value="">Land auswählen</option>
                    {!hasEuropeanCountry && selectedCountryCode ? (
                      <option value={selectedCountryCode}>
                        {selectedCountryCode}
                      </option>
                    ) : null}
                    {EUROPEAN_COUNTRIES.map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-zoneCode`}
                  >
                    Bundesland / Region <span>(optional)</span>
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label="Bundesland oder Region"
                    aria-describedby={`${idPrefix}-zoneCode-help`}
                    autoComplete="address-level1"
                    defaultValue={address?.zoneCode ?? ''}
                    id={`${idPrefix}-zoneCode`}
                    name="zoneCode"
                    placeholder="z. B. Provinz- oder Regionscode"
                    type="text"
                  />
                  <small
                    className="account-addresses__help"
                    id={`${idPrefix}-zoneCode-help`}
                  >
                    Nur ausfüllen, wenn das gewählte Land eine Region verlangt.
                  </small>
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-phoneNumber`}
                  >
                    Telefon
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label="Telefonnummer"
                    autoComplete="tel"
                    defaultValue={address?.phoneNumber ?? ''}
                    id={`${idPrefix}-phoneNumber`}
                    name="phoneNumber"
                    placeholder="+491701234567"
                    pattern="^\+[1-9]\d{6,14}$"
                    title="Bitte geben Sie die Telefonnummer im internationalen Format ein, zum Beispiel +491701234567."
                    type="tel"
                  />
                </div>
              </div>
              <div className="account-addresses__checkbox-row">
                <input
                  className="account-addresses__checkbox"
                  defaultChecked={isDefaultAddress}
                  disabled={isDefaultAddress}
                  id={`${idPrefix}-defaultAddress`}
                  name={isDefaultAddress ? undefined : 'defaultAddress'}
                  onChange={() => {
                    if (autoSubmitDefault) {
                      autoSubmitRef.current?.click();
                    }
                  }}
                  type="checkbox"
                />
                {isDefaultAddress ? (
                  <input type="hidden" name="defaultAddress" value="on" />
                ) : null}
                <label
                  className="account-addresses__checkbox-label"
                  htmlFor={`${idPrefix}-defaultAddress`}
                >
                  Als Standardadresse festlegen
                </label>
              </div>
              {error ? (
                <p className="account-message account-message--error">
                  {error}
                </p>
              ) : null}
              {children({
                stateForMethod,
                closeEditor: () => setIsEditing(false),
              })}
            </>
          )}
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
