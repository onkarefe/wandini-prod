import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {flushSync} from 'react-dom';
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
  const [isMegaMenuOpen, setIsMegaMenuOpen] = useState(false);

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
      void navigate(
        {
          pathname: location.pathname,
          search: params.toString(),
        },
        {preventScrollReset: true},
      );
    },
    [location.pathname, navigate],
  );

  const getBaseParams = useCallback(() => {
    return normalizeCollectionSortParam(
      clearCollectionPaginationParams(new URLSearchParams(location.search)),
    );
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const activeInputs = params.getAll('f');

    if (!activeInputs.length) {
      setSelectedFilters({});
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
  }, [filters, location.search, validInputsByFilterId]);

  const handleFilterClick = useCallback(
    (filterId: string, input: string) => {
      const currentValues = selectedFilters[filterId] ?? [];
      const nextValues = currentValues.includes(input)
        ? currentValues.filter((value) => value !== input)
        : [...currentValues, input];
      const nextSelectedFilters =
        nextValues.length === 0
          ? {...selectedFilters}
          : {
              ...selectedFilters,
              [filterId]: nextValues,
            };

      if (nextValues.length === 0) {
        delete nextSelectedFilters[filterId];
      }

      const params = getBaseParams();

      replaceCollectionFilterParams(
        params,
        flattenSelectedFilters(nextSelectedFilters),
      );

      flushSync(() => {
        setSelectedFilters(nextSelectedFilters);
      });
      navigateWithParams(params);
    },
    [getBaseParams, navigateWithParams, selectedFilters],
  );

  const handleClearFilters = useCallback(() => {
    const params = getBaseParams();

    params.delete('f');

    flushSync(() => {
      setSelectedFilters({});
    });
    navigateWithParams(params);
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

      flushSync(() => {
        setSelectedFilters(nextSelectedFilters);
      });
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

  const activeFilterCount = activeChips.length;

  return (
    <div className="collection-filters">
      <div className="filters-bar">
        <button
          type="button"
          className={`filters-bar__trigger ${isMegaMenuOpen ? 'is-open' : ''}`}
          onClick={() => setIsMegaMenuOpen((value) => !value)}
          aria-expanded={isMegaMenuOpen}
        >
          <span className="filters-bar__trigger-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
              <path d="M96 160C96 142.3 110.3 128 128 128L512 128C529.7 128 544 142.3 544 160C544 177.7 529.7 192 512 192L128 192C110.3 192 96 177.7 96 160zM96 320C96 302.3 110.3 288 128 288L512 288C529.7 288 544 302.3 544 320C544 337.7 529.7 352 512 352L128 352C110.3 352 96 337.7 96 320zM544 480C544 497.7 529.7 512 512 512L128 512C110.3 512 96 497.7 96 480C96 462.3 110.3 448 128 448L512 448C529.7 448 544 462.3 544 480z" />
            </svg>
          </span>
          <span className="filters-bar__trigger-label">Filters</span>
        </button>

        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="filters-bar__reset"
            onClick={handleClearFilters}
          >
            Reset
          </button>
        ) : null}
      </div>

      {isMegaMenuOpen ? (
        <div className="filters-mega" aria-label="Product filters">
          <div className="filters-mega__head">
            <div className="filters-mega__status">
              {activeFilterCount > 0 ? `${activeFilterCount} selected` : 'All filters'}
            </div>
            <button
              type="button"
              className="filters-mega__close"
              onClick={() => setIsMegaMenuOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="filters-mega__grid">
            {filters.map((filter) => {
              const selectedCount = getSelectedCount(filter.id);

              return (
                <section key={filter.id} className="filter-group">
                  <div className="filter-group__head">
                    <h3 className="filter-group__title">{filter.label}</h3>
                    <span className="filter-group__meta">
                      {selectedCount > 0
                        ? `${selectedCount} selected`
                        : `${filter.values.length} options`}
                    </span>
                  </div>

                  <ul className="filter-group__options">
                    {filter.values.map((value: FilterValue) => {
                      const input = getFilterValueInput(value);

                      if (!input) {
                        return null;
                      }

                      return (
                        <li key={value.id} className="filter-group__option">
                          <label className="filter-group__option-label">
                            <input
                              type="checkbox"
                              className="filter-group__checkbox"
                              checked={isActive(filter.id, input)}
                              onChange={() => handleFilterClick(filter.id, input)}
                            />
                            <span
                              className="filter-group__checkbox-ui"
                              aria-hidden="true"
                            />
                            <span className="filter-group__option-text">
                              {value.label}
                            </span>
                            {typeof value.count === 'number' ? (
                              <span className="filter-group__option-count">
                                {value.count}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {activeChips.length > 0 ? (
            <div className="filters-selected">
              {activeChips.map((chip) => (
                <button
                  key={`${chip.filterId}-${chip.valueInput}`}
                  type="button"
                  className="filters-selected__chip"
                  onClick={() =>
                    handleRemoveFilterValue(chip.filterId, chip.valueInput)
                  }
                >
                  <span className="filters-selected__chip-text">{chip.valueLabel}</span>
                  <span className="filters-selected__chip-icon" aria-hidden="true">
                    x
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
