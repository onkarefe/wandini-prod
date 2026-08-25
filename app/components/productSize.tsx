import React, { useState } from 'react';
import {MAX_CONFIGURATOR_HEIGHT_CM} from '~/lib/configurator-pricing';
import {useTranslation} from '~/i18n/useTranslation';

// Props: Değerler değiştiğinde üst bileşene iletmek için
type ProductSizeProps = {
	onChange?: (size: { width: number; height: number }) => void;
	widthError?: string;
	heightError?: string;
};

export const ProductSize: React.FC<ProductSizeProps> = ({
	onChange,
	widthError,
	heightError,
}) => {
	const {t} = useTranslation();
	const [width, setWidth] = useState<string>('0');
	const [height, setHeight] = useState<string>('0');
	const [isWidthEdited, setIsWidthEdited] = useState<boolean>(false);
	const [isHeightEdited, setIsHeightEdited] = useState<boolean>(false);

	const toNumber = (value: string) => (value === '' ? 0 : Number(value));

	const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setWidth(value);
		setIsWidthEdited(true);
		if (onChange) onChange({ width: toNumber(value), height: toNumber(height) });
	};

	const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value;
		setHeight(value);
		setIsHeightEdited(true);
		if (onChange) onChange({ width: toNumber(width), height: toNumber(value) });
	};

	const handleWidthFocus = () => {
		if (!isWidthEdited && width === '0') {
			setWidth('');
		}
	};

	const handleHeightFocus = () => {
		if (!isHeightEdited && height === '0') {
			setHeight('');
		}
	};

	return (
		<div className="customSizeMainBox">
			<div className="customSizeField">
				<label htmlFor="product-width">{t('product.widthCm')}</label>
				<div className="relativeInputBox">
					<input
						id="product-width"
						type="number"
						min={0}
						value={width}
						onFocus={handleWidthFocus}
						onChange={handleWidthChange}
						aria-invalid={Boolean(widthError)}
						aria-describedby={widthError ? 'product-width-error' : undefined}
					/>
				</div>
				{widthError && (
					<p id="product-width-error" className="customSizeError" role="alert">
						{widthError}
					</p>
				)}
			</div>

			<div className="customSizeField">
				<label htmlFor="product-height">{t('product.heightCm')}</label>
				<div className="relativeInputBox">
					<input
						id="product-height"
						type="number"
						min={0}
						max={MAX_CONFIGURATOR_HEIGHT_CM}
						value={height}
						onFocus={handleHeightFocus}
						onChange={handleHeightChange}
						aria-invalid={Boolean(heightError)}
						aria-describedby={heightError ? 'product-height-error' : undefined}
					/>
				</div>
				{heightError && (
					<p id="product-height-error" className="customSizeError" role="alert">
						{heightError}
					</p>
				)}
			</div>
		</div>
	);
};
