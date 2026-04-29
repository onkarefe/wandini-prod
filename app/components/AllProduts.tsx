import React from 'react';
import {Link} from '~/lib/i18n-router';

type AllProductItem = {
    id: string;
    title: string;
    subtitle: string;
    image: { url: string; altText?: string; width?: number; height?: number } | null;
    link: string;
};

interface AllProdutsProps {
    items: AllProductItem[];
}

function isExternalUrl(url: string) {
    return /^[a-z][a-z\d+\-.]*:/i.test(url) || url.startsWith('//');
}

export default function AllProduts({ items }: AllProdutsProps) {
    if (!items || items.length === 0) return null;
    return (
        <div className="container mx-auto my-[50px] md:my-0">
            <div className="seperator">
                <h3>All Products</h3>
            </div>
            <div className="all-products-list">
                {items.map((item: AllProductItem, idx: number) => (
                    item.link ? (
                        isExternalUrl(item.link) ? (
                            <a
                                key={item.id || idx}
                                href={item.link}
                                className="all-product-row all-product-link"
                                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                            >
                                {item.image?.url && (
                                    <div className="all-productIMGBOX">
                                        <img
                                            src={item.image.url}
                                            alt={item.image.altText || item.title}
                                            className="all-product-image"
                                        />
                                    </div>
                                )}
                                <div className="all-product-info">
                                    <div className="all-product-title">{item.title}</div>
                                    <div className="all-product-subtitle">{item.subtitle}</div>
                                </div>
                            </a>
                        ) : (
                            <Link
                                key={item.id || idx}
                                to={item.link}
                                className="all-product-row all-product-link"
                                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                            >
                                {item.image?.url && (
                                    <div className="all-productIMGBOX">
                                        <img
                                            src={item.image.url}
                                            alt={item.image.altText || item.title}
                                            className="all-product-image"
                                        />
                                    </div>
                                )}
                                <div className="all-product-info">
                                    <div className="all-product-title">{item.title}</div>
                                    <div className="all-product-subtitle">{item.subtitle}</div>
                                </div>
                            </Link>
                        )
                    ) : (
                        <div key={item.id || idx} className="all-product-row">
                            {item.image?.url && (
                                <img
                                    src={item.image.url}
                                    alt={item.image.altText || item.title}
                                    className="all-product-image"
                                />
                            )}
                            <div className="all-product-info">
                                <div className="all-product-title">{item.title}</div>
                                <div className="all-product-subtitle">{item.subtitle}</div>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}
