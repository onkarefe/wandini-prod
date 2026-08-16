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

export type ActionResponse = {
  error: string | null;
  customer: CustomerFragment | null;
};

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Profil'},
    {name: 'robots', content: PRIVATE_ROBOTS_DIRECTIVE},
  ];
};

const PROFILE_ERROR_MESSAGES = {
  update:
    'Ihr Profil konnte derzeit nicht aktualisiert werden. Bitte versuchen Sie es erneut.',
  methodNotAllowed: 'Diese Anfrage für das Profil ist nicht zulässig.',
} as const;

function getProfileErrorMessage(_error: unknown, fallback: string) {
  return fallback;
}

export async function loader({context}: Route.LoaderArgs) {
  context.customerAccount.handleAuthStatus();

  return {};
}

export async function action({request, context}: Route.ActionArgs) {
  const {customerAccount} = context;

  if (request.method !== 'PUT') {
    return data<ActionResponse>(
      {
        error: PROFILE_ERROR_MESSAGES.methodNotAllowed,
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
        error: getProfileErrorMessage(error, PROFILE_ERROR_MESSAGES.update),
        customer: null,
      },
      {status: 400},
    );
  }
}

export default function AccountProfile() {
  const account = useOutletContext<{customer: CustomerFragment}>();
  const {state, formMethod} = useNavigation();
  const action = useActionData<ActionResponse>();
  const customer = action?.customer ?? account?.customer;
  const isSubmitting = state !== 'idle' && formMethod === 'PUT';

  return (
    <div className="account-page account-profile">
      <header className="account-page__header">
        <div>
          <p className="account-page__eyebrow">Persönliche Angaben</p>
          <h2 className="account-page__title">Profil</h2>
          <p className="account-page__description">
            Halten Sie Ihren Namen für Bestellungen und die persönliche
            Ansprache aktuell.
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
            <legend className="account-sr-only">Persönliche Angaben</legend>
            <div className="account-profile__field">
              <label className="account-profile__label" htmlFor="firstName">
                Vorname
              </label>
              <input
                className="account-profile__input"
                id="firstName"
                name="firstName"
                type="text"
                autoComplete="given-name"
                placeholder="Vorname"
                aria-label="Vorname"
                defaultValue={customer.firstName ?? ''}
                minLength={2}
              />
            </div>
            <div className="account-profile__field">
              <label className="account-profile__label" htmlFor="lastName">
                Nachname
              </label>
              <input
                className="account-profile__input"
                id="lastName"
                name="lastName"
                type="text"
                autoComplete="family-name"
                placeholder="Nachname"
                aria-label="Nachname"
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
                Ihre Angaben wurden gespeichert.
              </p>
            ) : null}
          </div>
          <div className="account-profile__actions">
            <button
              className="account-button account-button--primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Wird gespeichert...' : 'Änderungen speichern'}
            </button>
          </div>
        </Form>
      </section>
    </div>
  );
}
