import notFoundImage from '~/assets/images/404MU.webp';
import {useTranslation} from '~/i18n/useTranslation';
import {Link} from '~/lib/i18n-router';

export function NotFoundPage() {
  const {t} = useTranslation();

  return (
    <section className='notFound' aria-labelledby='not-found-title'>
      <div className='notFoundInner container mx-auto'>
        <div className='notFoundContent'>
          <div className='notFoundCopy'>
            <p className='notFoundEyebrow'>{t('notFound.eyebrow')}</p>
            <p className='notFoundCode' aria-hidden={true}>
              404
            </p>
            <h1 className='notFoundTitle' id='not-found-title'>
              {t('notFound.title')}
            </h1>
            <p className='notFoundDescription'>{t('notFound.description')}</p>

            <div className='notFoundActions'>
              <Link className='notFoundPrimary' to='/'>
                <span>{t('notFound.home')}</span>
                <span aria-hidden={true}>→</span>
              </Link>
              <Link
                className='notFoundSecondary'
                to='/collections/fototapeten'
              >
                <span>{t('notFound.explore')}</span>
                <span aria-hidden={true}>→</span>
              </Link>
            </div>
          </div>
        </div>

        <div className='notFoundMedia' aria-hidden={true}>
          <img className='notFoundImage' src={notFoundImage} alt='' />
        </div>
      </div>
    </section>
  );
}
