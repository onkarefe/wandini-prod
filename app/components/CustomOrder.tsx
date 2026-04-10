import React from 'react';

export default function CustomOrder() {
    return (
        <div className="customOrder-section">
            <div className="container mx-auto">
                <div className="customOrderRow">
                    <div className="customOrder-mainBox co-1">
                        <div className="customOrderTitle">
                            Custom Wall Art
                        </div>
                        <div className="customOrderSubtitle">
                            Create a personalized wallpaper, canvas or poster from your own image
                        </div>
                        <button
                            type="button"
                            className="customOrderButton"
                            aria-label="Custom upload coming soon"
                            aria-disabled="true"
                            title="Coming soon"
                        >
                            Upload Your Own Image
                        </button>
                    </div>
                    <div className="customOrder-mainBox co-2">
                        <img src="https://cdn.shopify.com/s/files/1/0953/1323/2152/files/customOrderBG.png?v=1761294680" alt="Custom Order BG" className="customOrderBG" />
                    </div>
                </div>
            </div>
        </div>
    );
}
