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
				<label htmlFor="product-width">Width</label>
				<div className="relativeInputBox">
					<input
						id="product-width"
						type="number"
						min={0}
						value={width}
						onFocus={handleWidthFocus}
						onChange={handleWidthChange}
					/>
					<span className="cmClass">
						Cm
					</span>
				</div>
			</div>

			<div className="customSizeField">
				<label htmlFor="product-height">Height</label>
				<div className="relativeInputBox">
					<input
						id="product-height"
						type="number"
						min={0}
						value={height}
						onFocus={handleHeightFocus}
						onChange={handleHeightChange}
					/>
					<span className="cmClass">
						Cm
					</span>
				</div>
			</div>
			<span className="warning">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
					<path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
				</svg>
				Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum sed erat aliquam, luctus quam sed, consequat magna.
			</span>
		</div>
	);
};
