import type {BreadcrumbItem} from '~/lib/breadcrumbs';
import '~/styles/product-breadcrumb.css';

export function Breadcrumbs({items}: {items: BreadcrumbItem[]}) {
  if (items.length < 2) return null;

  return (
    <nav className="product-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => {
          const isCurrentPage = index === items.length - 1;

          return (
            <li key={`${item.url}-${item.name}`}>
              {isCurrentPage ? (
                <span aria-current="page">{item.name}</span>
              ) : (
                <a href={item.url}>{item.name}</a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ProductBreadcrumb({items}: {items: BreadcrumbItem[]}) {
  return <Breadcrumbs items={items} />;
}
