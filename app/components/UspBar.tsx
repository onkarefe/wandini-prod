// UspBar.tsx
import * as React from "react";

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
  node?: any; // opsiyonel, eğer sayfa metaobject geçiriyorsa kullanılabilir
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function UspBar({ items, className }: UspBarProps) {
  if (!items?.length) return null;

  return (
    <section
      aria-label="Unique selling points"
      className={cx("uspbar !p-0", className)}
    >
      <div className="container mx-auto">
        <ul className="uspbar__list">
          {items.map((item, idx) => {
            const key = item.title ? `${item.title}-${idx}` : `usp-${idx}`;
            const hasImg = Boolean(item.icon?.url);

            return (
              <li key={key} className="uspbar__item">
                {/* Icon / Image */}
                <div
                  className={cx("uspbar__icon", hasImg ? "has-img" : "no-img")}
                  aria-hidden={hasImg ? undefined : true}
                >
                  {hasImg ? (
                    <img
                      src={item.icon!.url}
                      alt={item.icon?.altText ?? item.title ?? "USP icon"}
                      width={item.icon?.width ?? 48}
                      height={item.icon?.height ?? 48}
                      loading="lazy"
                      className="uspbar__img"
                    />
                  ) : (
                    <span className="uspbar__empty">—</span>
                  )}
                </div>

                {/* Texts */}
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
