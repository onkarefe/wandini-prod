import * as React from 'react';
import { Pagination } from '@shopify/hydrogen';
import {useTranslation} from '~/i18n/useTranslation';

/**
 * <PaginatedResourceSection > is a component that encapsulate how the previous and next behaviors throughout your application.
 */
export function PaginatedResourceSection<NodesType>({
  connection,
  children,
  resourcesClassName,
  previousLabel,
  nextLabel,
}: {
  connection: React.ComponentProps<typeof Pagination<NodesType>>['connection'];
  children: React.FunctionComponent<{ node: NodesType; index: number }>;
  resourcesClassName?: string;
  previousLabel?: string;
  nextLabel?: string;
}) {
  const {t} = useTranslation();
  const resolvedPreviousLabel = previousLabel ?? t('common.loadPrevious');
  const resolvedNextLabel = nextLabel ?? t('common.loadMore');

  return (
    <Pagination connection={connection}>
      {({ nodes, PreviousLink, NextLink }) => {
        const resourcesMarkup = nodes.map((node, index) =>
          children({ node, index }),
        );

        return (
            <div>
              <PreviousLink>
                <span className="collectionReloadButton">
                  {resolvedPreviousLabel}
                </span>
              </PreviousLink>
              {resourcesClassName ? (
                <div className={resourcesClassName}>{resourcesMarkup}</div>
              ) : (
                resourcesMarkup
              )}
              <NextLink>
                <span className="collectionReloadButton">
                  {resolvedNextLabel}
                </span>
              </NextLink>
            </div>
          );
      }}
    </Pagination>
  );
}
