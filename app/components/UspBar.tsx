import * as React from 'react';
import {Image} from '@shopify/hydrogen';
import {useTranslation} from '~/i18n/useTranslation';

export type UspImage = {
  url: string;
  altText?: string | null;
  width?: number | null;
  height?: number | null;
};

export type UspItem = {
  icon?: UspImage | null;
  title: string;
  subtitle?: string | null;
};

type UspBarProps = {
  items: UspItem[];
  className?: string;
  node?: unknown;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export default function UspBar({items, className}: UspBarProps) {
  const {t} = useTranslation();
  if (!items?.length) return null;

  return (
    <section
      aria-label={t('home.benefits')}
      className={cx('uspbar !p-0', className)}
    >
      <div className="container mx-auto uspbar__container">
        <ul className="uspbar__list">
          {items.map((item, idx) => {
            const key = item.title ? `${item.title}-${idx}` : `usp-${idx}`;
            const hasImg = Boolean(item.icon?.url);

            return (
              <li key={key} className="uspbar__item">
                {hasImg ? (
                  <span className="uspbar__icon" aria-hidden="true">
                    <Image
                      data={item.icon!}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="uspbar__img"
                      sizes="40px"
                      srcSet={[40, 80, 120]
                        .map((width) => {
                          const url = new URL(item.icon!.url);
                          url.searchParams.set('width', String(width));
                          return `${url.toString()} ${width}w`;
                        })
                        .join(', ')}
                    />
                  </span>
                ) : null}

                <div className="uspbar__text">
                  <div className="uspbar__title">{item.title}</div>
                  {item.subtitle ? (
                    <p className="uspbar__subtitle">{item.subtitle}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
