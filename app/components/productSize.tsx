import React, { useState } from 'react';

// Props: Değerler değiştiğinde üst bileşene iletmek için
type ProductSizeProps = {
	onChange?: (size: { width: number; height: number }) => void;
};

export const ProductSize: React.FC<ProductSizeProps> = ({ onChange }) => {
	const [width, setWidth] = useState<number>(0);
	const [height, setHeight] = useState<number>(0);

	const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = Number(e.target.value);
		setWidth(value);
		if (onChange) onChange({ width: value, height });
	};

	const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = Number(e.target.value);
		setHeight(value);
		if (onChange) onChange({ width, height: value });
	};

	return (
		<div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
			<div>
				<label htmlFor="product-width">Genişlik (cm): </label>
				<input
					id="product-width"
					type="number"
					min={0}
					value={width}
					onChange={handleWidthChange}
					style={{ width: '80px' }}
				/>
			</div>
			<div>
				<label htmlFor="product-height">Yükseklik (cm): </label>
				<input
					id="product-height"
					type="number"
					min={0}
					value={height}
					onChange={handleHeightChange}
					style={{ width: '80px' }}
				/>
			</div>
		</div>
	);
};
