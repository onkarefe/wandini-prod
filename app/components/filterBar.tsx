import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useLocation, useNavigate} from 'react-router';
import type {CustomCollectionQuery} from 'storefrontapi.generated';
import {
  clearCollectionPaginationParams,
  normalizeCollectionSortParam,
  replaceCollectionFilterParams,
} from '~/lib/collectionParams';
import '../styles/filter.css';

type CollectionFilters = NonNullable<
  NonNullable<CustomCollectionQuery['collection']>['products']['filters']
>;
type CollectionFilter = CollectionFilters[number];
type FilterValue = CollectionFilter['values'][number];

type SelectedFilters = Record<string, string[]>;

interface FilterBarProps {
  filters: CollectionFilters;
}

function getFilterValueInput(value: Pick<FilterValue, 'input'>): string | null {
  return typeof value.input === 'string' ? value.input : null;
}

function flattenSelectedFilters(selectedFilters: SelectedFilters): string[] {
  return Object.values(selectedFilters).flatMap((values) => values);
}

export function FilterBar({filters}: FilterBarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const validInputsByFilterId = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const filter of filters) {
      map.set(
        filter.id,
        new Set(
          filter.values
            .map((value) => getFilterValueInput(value))
            .filter((value): value is string => value !== null),
        ),
      );
    }

    return map;
  }, [filters]);

  const navigateWithParams = useCallback(
    (params: URLSearchParams) => {
      void navigate({
        pathname: location.pathname,
        search: params.toString(),
      });
    },
    [location.pathname, navigate],
  );

  const getBaseParams = useCallback(() => {
    return normalizeCollectionSortParam(
      clearCollectionPaginationParams(new URLSearchParams(location.search)),
    );
  }, [location.search]);

  useEffect(() => {
    const mediaQueryList = window.matchMedia('(max-width: 1023px)');

    const syncViewportState = () => {
      const isMobile = mediaQueryList.matches;

      setIsMobileViewport(isMobile);

      if (!isMobile) {
        setIsMobileFiltersOpen(false);
      }
    };

    syncViewportState();

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', syncViewportState);

      return () => {
        mediaQueryList.removeEventListener('change', syncViewportState);
      };
    }

    mediaQueryList.addListener(syncViewportState);

    return () => {
      mediaQueryList.removeListener(syncViewportState);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const activeInputs = params.getAll('f');

    if (!activeInputs.length) {
      setSelectedFilters({});
      setOpenFilterId(null);
      setIsMobileFiltersOpen(false);
      return;
    }

    const nextSelectedFilters: SelectedFilters = {};

    for (const input of activeInputs) {
      for (const filter of filters) {
        if (!validInputsByFilterId.get(filter.id)?.has(input)) {
          continue;
        }

        const currentValues = nextSelectedFilters[filter.id] ?? [];

        if (!currentValues.includes(input)) {
          nextSelectedFilters[filter.id] = [...currentValues, input];
        }

        break;
      }
    }

    setSelectedFilters(nextSelectedFilters);
    setOpenFilterId(null);
    setIsMobileFiltersOpen(false);
  }, [filters, location.search, validInputsByFilterId]);

  const handleFilterClick = useCallback(
    (filterId: string, input: string) => {
      setSelectedFilters((currentSelectedFilters) => {
        const currentValues = currentSelectedFilters[filterId] ?? [];
        const nextValues = currentValues.includes(input)
          ? currentValues.filter((value) => value !== input)
          : [...currentValues, input];

        if (nextValues.length === 0) {
          const nextSelectedFilters = {...currentSelectedFilters};

          delete nextSelectedFilters[filterId];

          return nextSelectedFilters;
        }

        return {
          ...currentSelectedFilters,
          [filterId]: nextValues,
        };
      });
    },
    [],
  );

  const handleApplyFilters = useCallback(() => {
    const params = getBaseParams();

    replaceCollectionFilterParams(
      params,
      flattenSelectedFilters(selectedFilters),
    );

    navigateWithParams(params);
    setOpenFilterId(null);
    setIsMobileFiltersOpen(false);
  }, [getBaseParams, navigateWithParams, selectedFilters]);

  const handleClearFilters = useCallback(() => {
    const params = getBaseParams();

    params.delete('f');

    setSelectedFilters({});
    navigateWithParams(params);
    setOpenFilterId(null);
    setIsMobileFiltersOpen(false);
  }, [getBaseParams, navigateWithParams]);

  const isActive = useCallback(
    (filterId: string, input: string) => {
      return (selectedFilters[filterId] ?? []).includes(input);
    },
    [selectedFilters],
  );

  const getSelectedCount = useCallback(
    (filterId: string) => {
      return (selectedFilters[filterId] ?? []).length;
    },
    [selectedFilters],
  );

  const handleRemoveFilterValue = useCallback(
    (filterId: string, valueInput: string) => {
      const currentValues = selectedFilters[filterId] ?? [];
      const nextValues = currentValues.filter((value) => value !== valueInput);
      const nextSelectedFilters: SelectedFilters = {...selectedFilters};

      if (nextValues.length > 0) {
        nextSelectedFilters[filterId] = nextValues;
      } else {
        delete nextSelectedFilters[filterId];
      }

      const params = getBaseParams();

      replaceCollectionFilterParams(
        params,
        flattenSelectedFilters(nextSelectedFilters),
      );

      setSelectedFilters(nextSelectedFilters);
      navigateWithParams(params);
    },
    [getBaseParams, navigateWithParams, selectedFilters],
  );

  const activeChips = useMemo(() => {
    const chips: Array<{
      filterId: string;
      valueInput: string;
      valueLabel: string;
    }> = [];

    for (const filter of filters) {
      const activeInputs = selectedFilters[filter.id] ?? [];

      for (const input of activeInputs) {
        const matchedValue = filter.values.find(
          (value) => getFilterValueInput(value) === input,
        );

        if (matchedValue) {
          chips.push({
            filterId: filter.id,
            valueInput: input,
            valueLabel: matchedValue.label,
          });
        }
      }
    }

    return chips;
  }, [filters, selectedFilters]);

  if (filters.length === 0) {
    return null;
  }

  const shouldShowAccordion = !isMobileViewport || isMobileFiltersOpen;

  return (
    <div className="collection-filters">
      {isMobileViewport ? (
        <button
          type="button"
          className="filters-mobile-toggle"
          onClick={() => setIsMobileFiltersOpen((value) => !value)}
          aria-expanded={isMobileFiltersOpen}
        >
          <span className="filters-mobile-toggle__text">Filters</span>
          <span className="filters-mobile-toggle__icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z" />
            </svg>
          </span>
        </button>
      ) : null}

      {shouldShowAccordion ? (
        <div className="filters-accordion">
          <ul className="filters-list">
            {filters.map((filter) => {
              const selectedCount = getSelectedCount(filter.id);

              return (
                <li key={filter.id} className="filter-item">
                  <button
                    type="button"
                    className={`filter-item__head ${
                      openFilterId === filter.id ? 'is-open' : ''
                    }`}
                    onClick={() =>
                      setOpenFilterId((currentOpenFilterId) =>
                        currentOpenFilterId === filter.id ? null : filter.id,
                      )
                    }
                  >
                    <span className="filter-item__label">
                      {filter.label}
                      {selectedCount > 0 ? (
                        <span className="filter-item__badge">
                          {' ('}
                          {selectedCount}
                          {')'}
                        </span>
                      ) : null}
                    </span>
                    <span className="filter-item__icon" aria-hidden="true">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                        <path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z" />
                      </svg>
                    </span>
                  </button>

                  {openFilterId === filter.id ? (
                    <div className="filter-popover">
                      <ul className="filter-options">
                        {filter.values.map((value: FilterValue) => {
                          const input = getFilterValueInput(value);

                          if (!input) {
                            return null;
                          }

                          return (
                            <li key={value.id} className="filter-option">
                              <label className="filter-option__label">
                                <input
                                  type="checkbox"
                                  className="filter-option__checkbox"
                                  checked={isActive(filter.id, input)}
                                  onChange={() =>
                                    handleFilterClick(filter.id, input)
                                  }
                                />
                                <span className="filter-option__text">
                                  {value.label}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="filters-apply">
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn btn--clear"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApplyFilters}
              className="btn btn--apply"
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="filters-chips">
          {activeChips.map((chip) => (
            <button
              key={`${chip.filterId}-${chip.valueInput}`}
              type="button"
              className="filters-chip"
              onClick={() =>
                handleRemoveFilterValue(chip.filterId, chip.valueInput)
              }
            >
              <span className="filters-chip__text">{chip.valueLabel}</span>
              <span className="filters-chip__icon" aria-hidden="true">
                x
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
