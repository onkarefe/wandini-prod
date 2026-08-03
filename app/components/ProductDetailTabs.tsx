import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import '~/styles/ProductDetailTabs.css';

export interface ProductDetailTabsProps {
  tabTitles?: string[];
  tabContents?: ReactNode[];
}

export function ProductDetailTabs({
  tabTitles = [],
  tabContents = [],
}: ProductDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(0);
  const tabsId = useId().replace(/:/g, '');
  const tabCount = Math.min(tabTitles.length, tabContents.length);

  if (tabCount === 0) return null;

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabCount;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabCount) % tabCount;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabCount - 1;
    }

    if (nextIndex === null) return;

    event.preventDefault();
    setActiveTab(nextIndex);
    const tabButtons =
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
    tabButtons?.[nextIndex]?.focus();
  };

  return (
    <div className="custom-tabs">
      <div
        className="custom-tabs-header"
        role="tablist"
        aria-label="Product information"
      >
        {tabTitles.slice(0, tabCount).map((title, index) => (
          <button
            key={title}
            className={activeTab === index ? 'active' : ''}
            onClick={() => setActiveTab(index)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            type="button"
            role="tab"
            id={`${tabsId}-tab-${index}`}
            aria-controls={`${tabsId}-panel-${index}`}
            aria-selected={activeTab === index}
            tabIndex={activeTab === index ? 0 : -1}
          >
            {title}
          </button>
        ))}
      </div>

      <div className="custom-tabs-content">
        <div
          className="customTabContent"
          role="tabpanel"
          id={`${tabsId}-panel-${activeTab}`}
          aria-labelledby={`${tabsId}-tab-${activeTab}`}
          tabIndex={0}
        >
          {tabContents[activeTab]}
        </div>
      </div>
    </div>
  );
}

export default ProductDetailTabs;
