import React from 'react';

export default function CustomGrid() {
    return (
        <div className="container mx-auto">
            <div className="cg-line1">
                <div className="cgBox1 cgBoxMain">
                    <div className="cg-title">
                        New Collection
                    </div>
                    <a href="#" className="cg-button">Discover More</a>
                </div>
                <div className="cg1-part2">
                    <div className="cgBox2 cgBoxMain">
                        <div className="cg-title">
                            Featured
                        </div>
                        <a href="#" className="cg-button">Discover More</a>
                    </div>
                    <div className="cgBox3 cgBoxMain">
                        <div className="cg-title">
                            Trending
                        </div>
                        <a href="#" className="cg-button">Discover More</a>
                    </div>
                </div>
            </div>
            <div className="cg-line2">
                <div className="cg2-part2">
                    <div className="cgBox4 cgBoxMain">
                        <div className="cg-title">
                            Featured
                        </div>
                        <a href="#" className="cg-button">Discover More</a>
                    </div>
                    <div className="cgBox5 cgBoxMain">
                        <div className="cg-title">
                            Trending
                        </div>
                        <a href="#" className="cg-button">Discover More</a>
                    </div>
                </div>
                <div className="cgBox6 cgBoxMain">
                    <div className="cg-title">
                        New Collection
                    </div>
                    <a href="#" className="cg-button">Discover More</a>
                </div>
            </div>
        </div>
    );
}