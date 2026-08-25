import {useCallback, useEffect, useId, useMemo, useRef, useState} from 'react';
import {useLocation, useNavigate} from 'react-router';
import type {CustomCollectionQuery} from 'storefrontapi.generated';
import {
  clearCollectionPaginationParams,
  normalizeCollectionSortParam,
  replaceCollectionFilterParams,
} from '~/lib/collectionParams';
import '../styles/filter.css';
import type {Translator} from '~/i18n';
import {useTranslation} from '~/i18n/useTranslation';

type CollectionFilters = NonNullable<
  NonNullable<CustomCollectionQuery['collection']>['products']['filters']
>;
type CollectionFilter = CollectionFilters[number];
type FilterValue = CollectionFilter['values'][number];
type SelectedFilters = Record<string, string[]>;

interface FilterBarProps {
  filters: CollectionFilters;
  isUpdating?: boolean;
}

interface FilterIndex {
  filterIdByInput: Map<string, string>;
  valuesByFilterId: Map<string, Map<string, FilterValue>>;
}

function getFilterValueInput(value: Pick<FilterValue, 'input'>): string | null {
  return typeof value.input === 'string' ? value.input : null;
}

function flattenSelectedFilters(selectedFilters: SelectedFilters): string[] {
  return Object.values(selectedFilters).flatMap((values) => values);
}

function getActiveFilterLabel(count: number, t: Translator): string {
  return count === 1
    ? t('filters.activeOne')
    : t('filters.activeMany', {count});
}

function getOptionCountLabel(count: number, t: Translator): string {
  return count === 1
    ? t('filters.optionOne')
    : t('filters.optionMany', {count});
}

export function FilterBar({filters, isUpdating = false}: FilterBarProps) {
  const {t} = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const drawerId = useId();
  const drawerTitleId = useId();
  const filterGroupIdPrefix = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [expandedFilterIds, setExpandedFilterIds] = useState<Set<string>>(
    () => new Set(filters[0] ? [filters[0].id] : []),
  );

  const filterIndex = useMemo<FilterIndex>(() => {
    const filterIdByInput = new Map<string, string>();
    const valuesByFilterId = new Map<string, Map<string, FilterValue>>();

    for (const filter of filters) {
      const valuesByInput = new Map<string, FilterValue>();

      for (const value of filter.values) {
        const input = getFilterValueInput(value);

        if (!input) {
          continue;
        }

        valuesByInput.set(input, value);

        if (!filterIdByInput.has(input)) {
          filterIdByInput.set(input, filter.id);
        }
      }

      valuesByFilterId.set(filter.id, valuesByInput);
    }

    return {filterIdByInput, valuesByFilterId};
  }, [filters]);

  const selectedInputsByFilterId = useMemo(() => {
    const map = new Map<string, Set<string>>();

    for (const [filterId, inputs] of Object.entries(selectedFilters)) {
      map.set(filterId, new Set(inputs));
    }

    return map;
  }, [selectedFilters]);

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
    const nextSelectedFilters: SelectedFilters = {};

    for (const input of params.getAll('f')) {
      const filterId = filterIndex.filterIdByInput.get(input);

      if (!filterId) {
        continue;
      }

      const currentInputs = nextSelectedFilters[filterId] ?? [];

      if (!currentInputs.includes(input)) {
        nextSelectedFilters[filterId] = [...currentInputs, input];
      }
    }

    setSelectedFilters(nextSelectedFilters);
  }, [filterIndex, location.search]);

  useEffect(() => {
    const activeFilterIds = Object.keys(selectedFilters);

    if (activeFilterIds.length === 0) {
      return;
    }

    setExpandedFilterIds((currentIds) => {
      const nextIds = new Set(currentIds);
      let hasChanged = false;

      for (const filterId of activeFilterIds) {
        if (!nextIds.has(filterId)) {
          nextIds.add(filterId);
          hasChanged = true;
        }
      }

      return hasChanged ? nextIds : currentIds;
    });
  }, [selectedFilters]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (!isDrawerOpen) {
      if (dialog.open) {
        dialog.close();
      }

      return;
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    const handleBackdropPointerDown = (event: PointerEvent) => {
      if (event.target !== dialog) {
        return;
      }

      const bounds = dialog.getBoundingClientRect();
      const isInsideDrawer =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!isInsideDrawer) {
        setIsDrawerOpen(false);
      }
    };

    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dialog.addEventListener('pointerdown', handleBackdropPointerDown);

    return () => {
      dialog.removeEventListener('pointerdown', handleBackdropPointerDown);
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [isDrawerOpen]);

  const handleFilterChange = useCallback(
    (filterId: string, input: string) => {
      if (isUpdating) {
        return;
      }

      const currentInputs = selectedFilters[filterId] ?? [];
      const nextInputs = currentInputs.includes(input)
        ? currentInputs.filter((value) => value !== input)
        : [...currentInputs, input];
      const nextSelectedFilters: SelectedFilters = {...selectedFilters};

      if (nextInputs.length > 0) {
        nextSelectedFilters[filterId] = nextInputs;
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
    [getBaseParams, isUpdating, navigateWithParams, selectedFilters],
  );

  const handleClearFilters = useCallback(() => {
    if (isUpdating) {
      return;
    }

    const params = getBaseParams();
    params.delete('f');

    setSelectedFilters({});
    navigateWithParams(params);
  }, [getBaseParams, isUpdating, navigateWithParams]);

  const handleRemoveFilter = useCallback(
    (filterId: string, input: string) => {
      handleFilterChange(filterId, input);
    },
    [handleFilterChange],
  );

  const toggleFilterGroup = useCallback((filterId: string) => {
    setExpandedFilterIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(filterId)) {
        nextIds.delete(filterId);
      } else {
        nextIds.add(filterId);
      }

      return nextIds;
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const activeFilters = useMemo(() => {
    const items: Array<{
      filterId: string;
      input: string;
      label: string;
    }> = [];

    for (const [filterId, inputs] of Object.entries(selectedFilters)) {
      const valuesByInput = filterIndex.valuesByFilterId.get(filterId);

      for (const input of inputs) {
        const value = valuesByInput?.get(input);

        if (value) {
          items.push({filterId, input, label: value.label});
        }
      }
    }

    return items;
  }, [filterIndex, selectedFilters]);

  if (filters.length === 0) {
    return null;
  }

  const activeFilterCount = activeFilters.length;

  return (
    <div className="collection-filters" aria-busy={isUpdating}>
      <button
        ref={triggerRef}
        type="button"
        className="filters-trigger"
        onClick={() => setIsDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isDrawerOpen}
        aria-controls={drawerId}
        aria-label={
          activeFilterCount > 0
            ? t('filters.openWithCount', {count: activeFilterCount})
            : t('filters.open')
        }
      >
        <span className="filters-trigger__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 7h10M18 7h2M10 17h10M4 17h2M14 4v6M10 14v6" />
          </svg>
        </span>
        <span className="filters-trigger__label">{t('filters.title')}</span>
        {activeFilterCount > 0 ? (
          <span className="filters-trigger__count" aria-hidden="true">
            {activeFilterCount}
          </span>
        ) : null}
      </button>

      <dialog
        id={drawerId}
        ref={dialogRef}
        className={`filters-drawer ${isUpdating ? 'is-updating' : ''}`}
        aria-labelledby={drawerTitleId}
        onCancel={closeDrawer}
        onClose={() => {
          setIsDrawerOpen(false);
          triggerRef.current?.focus();
        }}
      >
        {isDrawerOpen ? (
          <div className="filters-drawer__surface">
            {isUpdating ? (
              <div className="filters-drawer__progress" aria-hidden="true">
                <span />
              </div>
            ) : null}

            <header className="filters-drawer__header">
              <div className="filters-drawer__heading">
                <h2 id={drawerTitleId} className="filters-drawer__title">
                  {t('filters.title')}
                </h2>
                <p className="filters-drawer__status" aria-live="polite">
                  {isUpdating
                    ? t('filters.updating')
                    : activeFilterCount > 0
                      ? getActiveFilterLabel(activeFilterCount, t)
                      : t('filters.refine')}
                </p>
              </div>

              <button
                type="button"
                className="filters-drawer__close"
                onClick={closeDrawer}
                aria-label={t('filters.close')}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="m5 5 10 10M15 5 5 15" />
                </svg>
              </button>
            </header>

            <div className="filters-drawer__body">
              {activeFilters.length > 0 ? (
                <section
                  className="filters-active"
                  aria-label={t('filters.active')}
                >
                  <div className="filters-active__header">
                    <h3 className="filters-active__title">
                      {t('filters.active')}
                    </h3>
                    <button
                      type="button"
                      className="filters-active__clear"
                      onClick={handleClearFilters}
                      disabled={isUpdating}
                    >
                      {t('filters.clearAll')}
                    </button>
                  </div>

                  <div className="filters-active__list">
                    {activeFilters.map((filter) => (
                      <button
                        key={`${filter.filterId}-${filter.input}`}
                        type="button"
                        className="filters-active__chip"
                        onClick={() =>
                          handleRemoveFilter(filter.filterId, filter.input)
                        }
                        disabled={isUpdating}
                        aria-label={t('filters.remove', {label: filter.label})}
                      >
                        <span>{filter.label}</span>
                        <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="m3 3 6 6M9 3 3 9" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="filters-groups">
                {filters.map((filter, index) => {
                  const selectedInputs =
                    selectedInputsByFilterId.get(filter.id) ??
                    new Set<string>();
                  const selectedCount = selectedInputs.size;
                  const isExpanded = expandedFilterIds.has(filter.id);
                  const optionsId = `${filterGroupIdPrefix}-${index}`;

                  return (
                    <section key={filter.id} className="filter-group">
                      <button
                        type="button"
                        className="filter-group__toggle"
                        onClick={() => toggleFilterGroup(filter.id)}
                        aria-expanded={isExpanded}
                        aria-controls={optionsId}
                      >
                        <span className="filter-group__heading">
                          <span className="filter-group__title">
                            {filter.label}
                          </span>
                          <span className="filter-group__meta">
                            {selectedCount > 0
                              ? t('filters.selected', {count: selectedCount})
                              : getOptionCountLabel(filter.values.length, t)}
                          </span>
                        </span>
                        <span
                          className="filter-group__chevron"
                          aria-hidden="true"
                        >
                          <svg viewBox="0 0 16 16" fill="none">
                            <path d="m4 6 4 4 4-4" />
                          </svg>
                        </span>
                      </button>

                      {isExpanded ? (
                        <ul id={optionsId} className="filter-group__options">
                          {filter.values.map((value) => {
                            const input = getFilterValueInput(value);

                            if (!input) {
                              return null;
                            }

                            const isSelected = selectedInputs.has(input);

                            return (
                              <li
                                key={value.id}
                                className="filter-group__option"
                              >
                                <label
                                  className={`filter-option ${
                                    isSelected ? 'is-selected' : ''
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="filter-option__input"
                                    checked={isSelected}
                                    onChange={() =>
                                      handleFilterChange(filter.id, input)
                                    }
                                    disabled={isUpdating}
                                  />
                                  <span
                                    className="filter-option__control"
                                    aria-hidden="true"
                                  >
                                    <svg viewBox="0 0 12 12" fill="none">
                                      <path d="m2.5 6 2.2 2.2L9.5 3.5" />
                                    </svg>
                                  </span>
                                  <span className="filter-option__label">
                                    {value.label}
                                  </span>
                                  {typeof value.count === 'number' ? (
                                    <span className="filter-option__count">
                                      {value.count}
                                    </span>
                                  ) : null}
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
