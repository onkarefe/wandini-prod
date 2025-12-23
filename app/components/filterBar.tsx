import React, { useState, useEffect, useCallback } from 'react';
import '../styles/filter.css';
import { useNavigate, useLocation } from 'react-router-dom';

interface FilterBarProps {
	filters: any[];
}

export const FilterBar: React.FC<FilterBarProps> = ({ filters }) => {
	const navigate = useNavigate();
	const location = useLocation();

	// URL’den gelen ve apply sonrası kullanılan filtreler
	const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
	// Açık olan filter pill
	const [openFilterId, setOpenFilterId] = useState<string | null>(null);

	// Mobile (xs/sm) filtre paneli açık/kapalı
	const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
	// Viewport mobile mı?
	const [isMobileViewport, setIsMobileViewport] = useState(false);

	// xs/sm/ md tespiti (<=767px)
	useEffect(() => {
		const mql = window.matchMedia('(max-width: 1023px)');

		const apply = () => {
			const mobile = mql.matches;
			setIsMobileViewport(mobile);

			// md+ geçince mobile panel mantığını resetle
			if (!mobile) {
				setIsMobileFiltersOpen(false);
			}
		};

		apply();

		// Safari uyumu için
		if (typeof mql.addEventListener === 'function') {
			mql.addEventListener('change', apply);
			return () => mql.removeEventListener('change', apply);
		} else {
			// @ts-ignore
			mql.addListener(apply);
			// @ts-ignore
			return () => mql.removeListener(apply);
		}
	}, []);

	// URL parametrelerini state'e yaz
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		const inputs = params.getAll('f');

		if (!inputs.length || !filters) {
			setSelectedFilters({});
			setOpenFilterId(null);
			// URL değiştiyse mobile paneli kapat
			setIsMobileFiltersOpen(false);
			return;
		}

		const map: Record<string, string[]> = {};
		const byId: Record<string, Set<string>> = {};

		for (const f of filters) {
			byId[f.id] = new Set((f.values || []).map((v: any) => v.input));
		}

		for (const inStr of inputs) {
			for (const f of filters) {
				if (byId[f.id]?.has(inStr)) {
					map[f.id] = map[f.id] || [];
					if (!map[f.id].includes(inStr)) map[f.id].push(inStr);
					break;
				}
			}
		}

		setSelectedFilters(map);
		setOpenFilterId(null);
		setIsMobileFiltersOpen(false);
	}, [location.search, filters]);

	const getFilterKey = useCallback((filter: any) => filter.id as string, []);

	// Popover içindeki checkbox click
	const handleFilterClick = useCallback(
		(filter: any, value: any) => {
			const key = getFilterKey(filter);
			const inputStr = value.input as string;

			setSelectedFilters((prev) => {
				const list = prev[key] || [];
				const exists = list.includes(inputStr);
				const next = exists ? list.filter((x) => x !== inputStr) : [...list, inputStr];
				return { ...prev, [key]: next };
			});
		},
		[getFilterKey]
	);

	// Global Uygula
	const handleApplyFilters = useCallback(() => {
		const params = new URLSearchParams();

		Object.values(selectedFilters).forEach((arr) => {
			arr.forEach((inputStr) => params.append('f', inputStr));
		});

		navigate({ pathname: location.pathname, search: params.toString() });
		setOpenFilterId(null);
		setIsMobileFiltersOpen(false);
	}, [selectedFilters, navigate, location.pathname]);

	// Global Temizle
	const handleClearFilters = useCallback(() => {
		setSelectedFilters({});
		navigate({ pathname: location.pathname, search: '' });
		setOpenFilterId(null);
		setIsMobileFiltersOpen(false);
	}, [navigate, location.pathname]);

	// Seçili mi?
	const isActive = useCallback(
		(filterId: string, inputStr: string) => (selectedFilters[filterId] || []).includes(inputStr),
		[selectedFilters]
	);

	// Filter pill toggle
	const toggleFilterOpen = (filterId: string) => {
		setOpenFilterId((prev) => (prev === filterId ? null : filterId));
	};

	// Her filter için kaç seçim var
	const getSelectedCount = (filterId: string) => {
		return (selectedFilters[filterId] || []).length;
	};

	// Tek bir seçili değeri chip üzerinden kaldırma
	const handleRemoveFilterValue = useCallback(
		(filterId: string, valueInput: string) => {
			setSelectedFilters((prev) => {
				const current = prev[filterId] || [];
				const nextValues = current.filter((v) => v !== valueInput);

				const nextSelected: Record<string, string[]> = { ...prev };
				if (nextValues.length) {
					nextSelected[filterId] = nextValues;
				} else {
					delete nextSelected[filterId];
				}

				// URL'yi yeni duruma göre güncelle
				const params = new URLSearchParams();
				Object.values(nextSelected).forEach((arr) => {
					arr.forEach((inputStr) => params.append('f', inputStr));
				});

				navigate({ pathname: location.pathname, search: params.toString() });

				return nextSelected;
			});
		},
		[navigate, location.pathname]
	);

	if (!filters || filters.length === 0) return null;

	// Seçili filtrelerden chip listesi oluştur
	const activeChips: {
		filterId: string;
		filterLabel: string;
		valueInput: string;
		valueLabel: string;
	}[] = [];

	filters.forEach((filter: any) => {
		const filterKey = filter.id;
		const selected = selectedFilters[filterKey] || [];
		if (!selected.length) return;

		selected.forEach((inputStr) => {
			const found = (filter.values || []).find((v: any) => v.input === inputStr);
			if (found) {
				activeChips.push({
					filterId: filterKey,
					filterLabel: filter.label,
					valueInput: inputStr,
					valueLabel: found.label,
				});
			}
		});
	});

	// Mobile'da panel kapalıysa filtre akordiyonu render ETME
	const shouldShowAccordion = !isMobileViewport || isMobileFiltersOpen;

	return (
		<div className="collection-filters">
			{/* XS/SM: Filtre Toggle Butonu (md+ hiç render edilmiyor) */}
			{isMobileViewport && (
				<button
					type="button"
					className="filters-mobile-toggle"
					onClick={() => setIsMobileFiltersOpen((v) => !v)}
					aria-expanded={isMobileFiltersOpen}
				>
					<span className="filters-mobile-toggle__text">Filters</span>
					<span className="filters-mobile-toggle__icon" aria-hidden="true">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z" /></svg>
					</span>
				</button>
			)}

			{/* ÜST SATIR: yan yana filter pill'ler */}
			{shouldShowAccordion && (
				<div className="filters-accordion">
					<ul className="filters-list">
						{filters.map((filter: any) => {
							const filterKey = filter.id;
							const selectedCount = getSelectedCount(filterKey);

							return (
								<li key={filterKey} className="filter-item">
									{/* PILL / BUTTON */}
									<button
										type="button"
										className={`filter-item__head ${openFilterId === filterKey ? 'is-open' : ''}`}
										onClick={() => toggleFilterOpen(filterKey)}
									>
										<span className="filter-item__label">
											{filter.label}
											{selectedCount > 0 && (
												<span className="filter-item__badge">
													{' · ('}
													{selectedCount}
													{')'}
												</span>
											)}
										</span>
										<span className="filter-item__icon" aria-hidden="true">
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
												<path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z" />
											</svg>
										</span>
									</button>

									{openFilterId === filterKey && (
										<div className="filter-popover">
											<ul className="filter-options">
												{filter.values.map((value: any) => (
													<li key={value.id} className="filter-option">
														<label className="filter-option__label">
															<input
																type="checkbox"
																className="filter-option__checkbox"
																checked={isActive(filterKey, value.input)}
																onChange={() => handleFilterClick(filter, value)}
															/>
															<span className="filter-option__text">{value.label}</span>
														</label>
													</li>
												))}
											</ul>
										</div>
									)}
								</li>
							);
						})}
					</ul>

					{/* Global Uygula / Temizle */}
					<div className="filters-apply">
						<button type="button" onClick={handleClearFilters} className="btn btn--clear">
							Reset
						</button>
						<button type="button" onClick={handleApplyFilters} className="btn btn--apply">
							Apply
						</button>
					</div>
				</div>
			)}

			{/* ALT SATIR: seçili filtre chip'leri */}
			{activeChips.length > 0 && (
				<div className="filters-chips">
					{activeChips.map((chip) => (
						<button
							key={`${chip.filterId}-${chip.valueInput}`}
							type="button"
							className="filters-chip"
							onClick={() => handleRemoveFilterValue(chip.filterId, chip.valueInput)}
						>
							<span className="filters-chip__text">{chip.valueLabel}</span>
							<span className="filters-chip__icon" aria-hidden="true">
								×
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
};
