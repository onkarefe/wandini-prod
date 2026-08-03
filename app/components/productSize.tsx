import React, { useState } from 'react';

// Props: Değerler değiştiğinde üst bileşene iletmek için
type ProductSizeProps = {
	onChange?: (size: { width: number; height: number }) => void;
};

export const ProductSize: React.FC<ProductSizeProps> = ({ onChange }) => {
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
				<label htmlFor="product-width">Breite (cm)</label>
				<div className="relativeInputBox">
					<input
						id="product-width"
						type="number"
						min={0}
						value={width}
						onFocus={handleWidthFocus}
						onChange={handleWidthChange}
					/>
				</div>
			</div>

			<div className="customSizeField">
				<label htmlFor="product-height">Höhe (cm)</label>
				<div className="relativeInputBox">
					<input
						id="product-height"
						type="number"
						min={0}
						value={height}
						onFocus={handleHeightFocus}
						onChange={handleHeightChange}
					/>
				</div>
			</div>
		</div>
	);
};
