import {Link} from '~/lib/i18n-router';

type HeroImage = { url: string; altText?: string | null; width?: number; height?: number } | null;

export default function HeroSection({
    title,
    st1,
    st2,
    buttonText,
    buttonAction,
    backgroundImage,
}: {
    title: string;
    st1: string;
    st2: string;
    buttonText: string;
    buttonAction: string;
    backgroundImage: HeroImage;
}) {
    const buttonHref = buttonAction.trim();

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
                        {buttonText && buttonHref ? (
                            <Link
                                className="defaultButton"
                                to={buttonHref}
                                aria-label={buttonText}
                                title={buttonText}
                            >
                                {buttonText}
                            </Link>
                        ) : null}
                    </div>
                </div>
            </div>


        </section>
    );
}
