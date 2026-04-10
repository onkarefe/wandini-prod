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
                <div className="hero-TitleBox">
                    <p className="hero-st1">{st1}</p>
                    <h1 className="hero-mainTitle">{title}</h1>
                    <p className="hero-st2">{st2}</p>
                    <button
                        type="button"
                        className="defaultButton"
                        aria-label="Discover more coming soon"
                        aria-disabled="true"
                        title="Coming soon"
                    >
                        Discover More
                    </button>
                </div>
            </div>


        </section>
    );
}
