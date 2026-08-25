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
import {createTranslator, type Translator} from '~/i18n';
import {useTranslation} from '~/i18n/useTranslation';
import {getLocaleFromRequest} from '~/lib/locale';
import {getLocaleRegionName} from '~/lib/locale-format';

export type ActionResponse = {
  addressId?: string | null;
  createdAddress?: AddressFragment;
  defaultAddress?: string | null;
  deletedAddress?: string | null;
  error: Record<AddressFragment['id'], string> | null;
  updatedAddress?: AddressFragment;
};

export const meta: Route.MetaFunction = ({data: routeData}) => {
  return [
    {title: createTranslator(routeData?.selectedLocale)('account.addresses')},
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

function getAddressErrorMessages(t: Translator) {
  return {
    generic: t('account.addressGenericError'),
    create: t('account.addressCreateError'),
    update: t('account.addressUpdateError'),
    delete: t('account.addressDeleteError'),
    unauthorized: t('account.addressUnauthorized'),
    invalidRequest: t('account.addressInvalid'),
    methodNotAllowed: t('account.addressMethodError'),
  };
}

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

export async function loader({context, request}: Route.LoaderArgs) {
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
    throw new Response(
      createTranslator(getLocaleFromRequest(request))('account.notFound'),
      {status: 404},
    );
  }

  return {
    customer: queryData.customer,
    selectedLocale: getLocaleFromRequest(request),
  };
}

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;
  const messages = getAddressErrorMessages(
    createTranslator(getLocaleFromRequest(request)),
  );

  try {
    const form = await request.formData();

    const addressId = form.has('addressId')
      ? String(form.get('addressId'))
      : null;
    if (!addressId) {
      return addressErrorResponse(
        NEW_ADDRESS_ID,
        null,
        messages.invalidRequest,
      );
    }

    // this will ensure redirecting to login never happen for mutatation
    const isLoggedIn = await customerAccount.isLoggedIn();
    if (!isLoggedIn) {
      return addressErrorResponse(
        addressId,
        null,
        messages.unauthorized,
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
            messages.create,
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
            messages.update,
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
            messages.delete,
          );
        }
      }

      default: {
        return addressErrorResponse(
          addressId,
          null,
          messages.methodNotAllowed,
          405,
        );
      }
    }
  } catch (error: unknown) {
    return addressErrorResponse(
      NEW_ADDRESS_ID,
      error,
      messages.generic,
    );
  }
}

export default function Addresses() {
  const {t} = useTranslation();
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
          <p className="account-page__eyebrow">
            {t('account.addressEyebrow')}
          </p>
          <h2 className="account-page__title">{t('account.addresses')}</h2>
          <p className="account-page__description">
            {t('account.addressDescription')}
          </p>
        </div>
        <button
          className="account-button account-button--primary"
          type="button"
          aria-controls={NEW_ADDRESS_ID}
          aria-expanded={isCreateOpen}
          onClick={() => setIsCreateOpen((current) => !current)}
        >
          {isCreateOpen ? t('account.closeForm') : t('account.newAddress')}
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
              <h3>{t('account.noAddressTitle')}</h3>
              <p>{t('account.noAddressDescription')}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function NewAddressForm() {
  const {t} = useTranslation();
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
              ? t('account.creatingAddress')
              : t('account.createAddress')}
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
  const {t} = useTranslation();
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
                  ? t('account.saving')
                  : t('account.save')}
              </button>
              <button
                className="account-button account-button--secondary"
                disabled={stateForMethod('PUT') !== 'idle'}
                type="button"
                onClick={closeEditor}
              >
                {t('account.cancel')}
              </button>
              <button
                className="account-button account-button--danger"
                disabled={stateForMethod('DELETE') !== 'idle'}
                formMethod="DELETE"
                type="submit"
                onClick={(event) => {
                  if (
                    !window.confirm(
                      t('account.deleteAddressConfirm'),
                    )
                  ) {
                    event.preventDefault();
                  }
                }}
              >
                {stateForMethod('DELETE') !== 'idle'
                  ? t('account.deleting')
                  : t('account.delete')}
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
  const {locale, t} = useTranslation();
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
          {isNewAddress ? t('account.newAddress') : t('account.savedAddress')}
        </legend>
        <div className={cardClassName}>
          <div className="account-addresses__card-head">
            <div className="account-addresses__card-intro">
              <h3 className="account-addresses__legend">
                {isNewAddress
                  ? t('account.newAddress')
                  : isEditing
                    ? t('account.editAddress')
                    : fullName || t('account.savedAddress')}
              </h3>
              {isDefaultAddress ? (
                <span className="account-addresses__status">
                  {t('account.defaultAddress')}
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
                  <span>
                    {getLocaleRegionName(
                      String(address.territoryCode),
                      locale,
                    )}
                  </span>
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
                  {t('account.edit')}
                </button>
                <button
                  className="account-button account-button--text-danger"
                  disabled={stateForMethod('DELETE') !== 'idle'}
                  formMethod="DELETE"
                  type="submit"
                  onClick={(event) => {
                    if (
                      !window.confirm(
                        t('account.deleteAddressConfirm'),
                      )
                    ) {
                      event.preventDefault();
                    }
                  }}
                >
                  {stateForMethod('DELETE') !== 'idle'
                    ? t('account.deleting')
                    : t('account.delete')}
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
                    {t('account.firstName')}*
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.firstName')}
                    autoComplete="given-name"
                    defaultValue={address?.firstName ?? ''}
                    id={`${idPrefix}-firstName`}
                    name="firstName"
                    placeholder={t('account.firstName')}
                    required
                    type="text"
                  />
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-lastName`}
                  >
                    {t('account.lastName')}*
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.lastName')}
                    autoComplete="family-name"
                    defaultValue={address?.lastName ?? ''}
                    id={`${idPrefix}-lastName`}
                    name="lastName"
                    placeholder={t('account.lastName')}
                    required
                    type="text"
                  />
                </div>
                <div className="account-addresses__field account-addresses__field--wide">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-company`}
                  >
                    {t('account.company')}
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.company')}
                    autoComplete="organization"
                    defaultValue={address?.company ?? ''}
                    id={`${idPrefix}-company`}
                    name="company"
                    placeholder={t('account.company')}
                    type="text"
                  />
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-address1`}
                  >
                    {t('account.street')}*
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.street')}
                    autoComplete="address-line1"
                    defaultValue={address?.address1 ?? ''}
                    id={`${idPrefix}-address1`}
                    name="address1"
                    placeholder={`${t('account.street')}*`}
                    required
                    type="text"
                  />
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-address2`}
                  >
                    {t('account.address2')}
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.address2')}
                    autoComplete="address-line2"
                    defaultValue={address?.address2 ?? ''}
                    id={`${idPrefix}-address2`}
                    name="address2"
                    placeholder={t('account.address2')}
                    type="text"
                  />
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-zip`}
                  >
                    {t('account.postalCode')}*
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.postalCode')}
                    autoComplete="postal-code"
                    defaultValue={address?.zip ?? ''}
                    id={`${idPrefix}-zip`}
                    name="zip"
                    placeholder={t('account.postalCode')}
                    required
                    type="text"
                  />
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-city`}
                  >
                    {t('account.city')}*
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.city')}
                    autoComplete="address-level2"
                    defaultValue={address?.city ?? ''}
                    id={`${idPrefix}-city`}
                    name="city"
                    placeholder={t('account.city')}
                    required
                    type="text"
                  />
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-territoryCode`}
                  >
                    {t('account.country')}*
                  </label>
                  <select
                    className="account-addresses__input"
                    aria-label={t('account.country')}
                    autoComplete="country"
                    defaultValue={selectedCountryCode}
                    id={`${idPrefix}-territoryCode`}
                    name="territoryCode"
                    required
                  >
                    <option value="">{t('account.selectCountry')}</option>
                    {!hasEuropeanCountry && selectedCountryCode ? (
                      <option value={selectedCountryCode}>
                        {selectedCountryCode}
                      </option>
                    ) : null}
                    {EUROPEAN_COUNTRIES.map(([code]) => (
                      <option key={code} value={code}>
                        {getLocaleRegionName(code, locale)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-zoneCode`}
                  >
                    {t('account.region')}{' '}
                    <span>({t('common.optional')})</span>
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.region')}
                    aria-describedby={`${idPrefix}-zoneCode-help`}
                    autoComplete="address-level1"
                    defaultValue={address?.zoneCode ?? ''}
                    id={`${idPrefix}-zoneCode`}
                    name="zoneCode"
                    placeholder={t('account.regionPlaceholder')}
                    type="text"
                  />
                  <small
                    className="account-addresses__help"
                    id={`${idPrefix}-zoneCode-help`}
                  >
                    {t('account.regionHelp')}
                  </small>
                </div>
                <div className="account-addresses__field">
                  <label
                    className="account-addresses__label"
                    htmlFor={`${idPrefix}-phoneNumber`}
                  >
                    {t('account.phone')}
                  </label>
                  <input
                    className="account-addresses__input"
                    aria-label={t('account.phoneNumber')}
                    autoComplete="tel"
                    defaultValue={address?.phoneNumber ?? ''}
                    id={`${idPrefix}-phoneNumber`}
                    name="phoneNumber"
                    placeholder="+491701234567"
                    pattern="^\+[1-9]\d{6,14}$"
                    title={t('account.phoneFormat')}
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
                  {t('account.setDefaultAddress')}
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
            {t('account.automaticSave')}
          </button>
        </div>
      </fieldset>
    </Form>
  );
}
