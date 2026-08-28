import type {ProductBreadcrumbItem} from '~/lib/product-seo';
import '~/styles/product-breadcrumb.css';

export function ProductBreadcrumb({items}: {items: ProductBreadcrumbItem[]}) {
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
