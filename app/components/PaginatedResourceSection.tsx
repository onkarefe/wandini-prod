import * as React from 'react';
import { Pagination } from '@shopify/hydrogen';

/**
 * <PaginatedResourceSection > is a component that encapsulate how the previous and next behaviors throughout your application.
 */
export function PaginatedResourceSection<NodesType>({
  connection,
  children,
  resourcesClassName,
}: {
  connection: React.ComponentProps<typeof Pagination<NodesType>>['connection'];
  children: React.FunctionComponent<{ node: NodesType; index: number }>;
  resourcesClassName?: string;
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
                <span className="collectionReloadButton">Load previous</span>
              </PreviousLink>
              {resourcesClassName ? (
                <div className={resourcesClassName}>{resourcesMarkup}</div>
              ) : (
                resourcesMarkup
              )}
              <NextLink>
                <span className="collectionReloadButton">Load more +</span>
              </NextLink>
            </div>
          );
      }}
    </Pagination>
  );
}
