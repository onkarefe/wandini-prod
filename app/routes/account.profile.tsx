import type {CustomerFragment} from 'customer-accountapi.generated';
import type {CustomerUpdateInput} from '@shopify/hydrogen/customer-account-api-types';
import {CUSTOMER_UPDATE_MUTATION} from '~/graphql/customer-account/CustomerUpdateMutation';
import {
  data,
  Form,
  useActionData,
  useNavigation,
  useOutletContext,
} from 'react-router';
import type {Route} from './+types/account.profile';
import {PRIVATE_ROBOTS_DIRECTIVE} from '~/lib/seo';
import {createTranslator} from '~/i18n';
import {useTranslation} from '~/i18n/useTranslation';
import {getLocaleFromRequest} from '~/lib/locale';

export type ActionResponse = {
  error: string | null;
  customer: CustomerFragment | null;
};

export const meta: Route.MetaFunction = ({data: routeData}) => {
  return [
    {title: createTranslator(routeData?.selectedLocale)('account.profile')},
    {name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE},
  ];
};

function getProfileErrorMessage(_error: unknown, fallback: string) {
  return fallback;
}

export async function loader({context, request}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();

  return {selectedLocale: getLocaleFromRequest(request)};
}

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;
  const t = createTranslator(getLocaleFromRequest(request));

  if (request.method !== 'PUT') {
    return data<ActionResponse>(
      {
        error: t('account.profileMethodError'),
        customer: null,
      },
      {status: 405},
    );
  }

  const form = await request.formData();

  try {
    const customer: CustomerUpdateInput = {};
    const validInputKeys = ['firstName', 'lastName'] as const;
    for (const [key, value] of form.entries()) {
      if (!validInputKeys.includes(key as any)) {
        continue;
      }
      if (typeof value === 'string' && value.length) {
        customer[key as (typeof validInputKeys)[number]] = value;
      }
    }

    // update customer and possibly password
    const {data, errors} = await customerAccount.mutate(
      CUSTOMER_UPDATE_MUTATION,
      {
        variables: {
          customer,
          language: customerAccount.i18n.language,
        },
      },
    );

    if (errors?.length) {
      throw new Error(errors[0].message);
    }

    if (data?.customerUpdate?.userErrors?.length) {
      throw new Error(data.customerUpdate.userErrors[0].message);
    }

    if (!data?.customerUpdate?.customer) {
      throw new Error(
        'Die Aktualisierung des Kundenprofils ist fehlgeschlagen.',
      );
    }

    return {
      error: null,
      customer: data?.customerUpdate?.customer,
    };
  } catch (error: unknown) {
    return data<ActionResponse>(
      {
        error: getProfileErrorMessage(error, t('account.profileUpdateError')),
        customer: null,
      },
      {status: 400},
    );
  }
}

export default function AccountProfile() {
  const {t} = useTranslation();
  const account = useOutletContext<{customer: CustomerFragment}>();
  const {state, formMethod} = useNavigation();
  const action = useActionData<ActionResponse>();
  const customer = action?.customer ?? account?.customer;
  const isSubmitting = state !== 'idle' && formMethod === 'PUT';

  return (
    <div className="account-page account-profile">
      <header className="account-page__header">
        <div>
          <p className="account-page__eyebrow">
            {t('account.profileEyebrow')}
          </p>
          <h2 className="account-page__title">{t('account.profile')}</h2>
          <p className="account-page__description">
            {t('account.profileDescription')}
          </p>
        </div>
      </header>

      <section className="account-profile__section">
        <Form
          method="PUT"
          className="account-profile__form"
          aria-busy={isSubmitting}
        >
          <fieldset
            className="account-profile__fieldset"
            disabled={isSubmitting}
          >
            <legend className="account-sr-only">
              {t('account.personalDetails')}
            </legend>
            <div className="account-profile__field">
              <label className="account-profile__label" htmlFor="firstName">
                {t('account.firstName')}
              </label>
              <input
                className="account-profile__input"
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder={t('account.firstName')}
                aria-label={t('account.firstName')}
                defaultValue={customer.firstName ?? ''}
                minLength={2}
              />
            </div>
            <div className="account-profile__field">
              <label className="account-profile__label" htmlFor="lastName">
                {t('account.lastName')}
              </label>
              <input
                className="account-profile__input"
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder={t('account.lastName')}
                aria-label={t('account.lastName')}
                defaultValue={customer.lastName ?? ''}
                minLength={2}
              />
            </div>
          </fieldset>
          <div aria-live="polite">
            {action?.error ? (
              <p className="account-message account-message--error">
                {action.error}
              </p>
            ) : action?.customer ? (
              <p className="account-message account-message--success">
                {t('account.saved')}
              </p>
            ) : null}
          </div>
          <div className="account-profile__actions">
            <button
              className="account-button account-button--primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? t('account.saving') : t('account.saveChanges')}
            </button>
          </div>
        </Form>
      </section>
    </div>
  );
}
