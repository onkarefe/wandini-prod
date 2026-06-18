import * as React from 'react';

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
  if (!items?.length) return null;

  return (
    <section
      aria-label="Wandini benefits"
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
                    <img
                      src={item.icon!.url}
                      alt=""
                      width={item.icon?.width ?? 40}
                      height={item.icon?.height ?? 40}
                      loading="lazy"
                      className="uspbar__img"
                    />
                  </span>
                ) : null}

                <div className="uspbar__text">
                  <h3 className="uspbar__title">{item.title}</h3>
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
