import React from 'react';

export type Navigation = {
  dataset: string | null;
  update: (data: Partial<Omit<Navigation, 'update'>>) => void;
};

const NavigationContext = React.createContext<Navigation>({
  dataset: null,
  update: () => {},
});

export const ProvideNavigation: React.FC<React.PropsWithChildren> = props => {
  const [data, setData] = React.useState<Omit<Navigation, 'update'>>({ dataset: null });

  const update = React.useCallback<Navigation['update']>(
    newData => setData(current => ({ ...current, ...newData })),
    [],
  );

  return <NavigationContext.Provider value={{ ...data, update }}>{props.children}</NavigationContext.Provider>;
};

export function useNavigation() {
  return React.useContext(NavigationContext);
}
