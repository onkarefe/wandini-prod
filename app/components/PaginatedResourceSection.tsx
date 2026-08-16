import * as React from 'react';
import { Pagination } from '@shopify/hydrogen';

/**
 * <PaginatedResourceSection > is a component that encapsulate how the previous and next behaviors throughout your application.
 */
export function PaginatedResourceSection<NodesType>({
  connection,
  children,
  resourcesClassName,
  previousLabel = 'Load previous',
  nextLabel = 'Load more +',
}: {
  connection: React.ComponentProps<typeof Pagination<NodesType>>['connection'];
  children: React.FunctionComponent<{ node: NodesType; index: number }>;
  resourcesClassName?: string;
  previousLabel?: string;
  nextLabel?: string;
}) {
  return (
    <Pagination connection={connection}>
      {({ nodes, PreviousLink, NextLink }) => {
        const resourcesMarkup = nodes.map((node, index) =>
          children({ node, index }),
        );

        return (
            <div>
              <PreviousLink>
                <span className="collectionReloadButton">{previousLabel}</span>
              </PreviousLink>
              {resourcesClassName ? (
                <div className={resourcesClassName}>{resourcesMarkup}</div>
              ) : (
                resourcesMarkup
              )}
              <NextLink>
                <span className="collectionReloadButton">{nextLabel}</span>
              </NextLink>
            </div>
          );
      }}
    </Pagination>
  );
}
