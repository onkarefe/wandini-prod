import { Image } from '@shopify/hydrogen';

type HeroImage = { url: string; altText?: string | null; width?: number; height?: number } | null;

export default function HeroSection({
    title,
    st1,
    st2,
    backgroundImage,
}: {
    title: string;
    st1: string;
    st2: string;
    backgroundImage: HeroImage;
}) {
    const scrollToProducts = () => {
        const productsSection = document.getElementById('all-products-section');

        if (!productsSection) return;

        window.scrollTo({
            top: productsSection.getBoundingClientRect().top + window.scrollY - 100,
            behavior: 'smooth',
        });
    };

    return (
        <section className="relative overflow-hidden !p-0">
            <div className="relative overflow-hidden mainHeroDiv"
                style={{
                    backgroundImage: `url(${(backgroundImage as any)?.url || backgroundImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                }}
            >
                <div className="container mx-auto hero-ContentContainer">
                    <div className="hero-TitleBox">
                        <p className="hero-st1">{st1}</p>
                        <h1 className="hero-mainTitle">{title}</h1>
                        <p className="hero-st2">{st2}</p>
                        <button
                            type="button"
                            className="defaultButton"
                            aria-label="Mehr entdecken"
                            title="Mehr entdecken"
                            onClick={scrollToProducts}
                        >
                            Mehr entdecken
                        </button>
                    </div>
                </div>
            </div>


        </section>
    );
}
