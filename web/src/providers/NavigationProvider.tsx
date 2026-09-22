import React from 'react';

import { buildProvider } from '~/utils/provider.js';

export type NavigationContext = {
  /** `dataset`: the student's test page; `datasets` / `users` / `services`: admin pages */
  page: 'dataset' | 'datasets' | 'users' | 'services';
  currentDataset: string | null;
  selectDataset: (data: Partial<Omit<NavigationContext, 'selectDataset'>>) => void;
};

const { Provider, useRequireValue: useNavigation } = buildProvider<NavigationContext>('ProvideNavigation');

export const ProvideNavigation: React.FC<React.PropsWithChildren> = props => {
  const [data, setData] = React.useState<Omit<NavigationContext, 'selectDataset'>>({
    currentDataset: null,
    page: 'dataset',
  });

  const selectDataset = React.useCallback<NavigationContext['selectDataset']>(
    newData => setData(current => ({ ...current, ...newData })),
    [],
  );

  return <Provider value={{ ...data, selectDataset }}>{props.children}</Provider>;
};

export { useNavigation };
