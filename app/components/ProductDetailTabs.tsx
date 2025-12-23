import React, { useState } from 'react';
import '~/styles/ProductDetailTabs.css';

export interface ProductDetailTabsProps {
  tabTitles?: string[];
  tabContents?: React.ReactNode[];
}

export function ProductDetailTabs({
  tabTitles = ['Sekme 1', 'Sekme 2', 'Sekme 3', 'Sekme 4'],
  tabContents = [
    '1. sekme içeriği',
    '2. sekme içeriği',
    '3. sekme içeriği',
    '4. sekme içeriği',
  ],
}: ProductDetailTabsProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="custom-tabs">
      <div className="custom-tabs-header">
        {tabTitles.map((title, idx) => (
          <button
            key={title}
            className={activeTab === idx ? 'active' : ''}
            onClick={() => setActiveTab(idx)}
            type="button"
          >
            {title}
          </button>
        ))}
      </div>

      <div className="custom-tabs-content">
        <div className="customTabContent">
          {tabContents[activeTab]}
        </div>
      </div>
    </div>
  );
}

export default ProductDetailTabs;
