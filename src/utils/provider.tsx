import React from 'react';

type BuildProviderResult<T> = {
  Provider: React.FC<{ children: React.ReactNode; value: T | null }>;
  useValue: () => T | null;
  useRequireValue: () => T;
};

export const buildProvider = <T,>(debugName: string, nullable = false): BuildProviderResult<T> => {
  const Context = React.createContext<{ data: T | null } | null>(null);

  const Provider: BuildProviderResult<T>['Provider'] = ({ children, value }): JSX.Element => (
    <Context.Provider value={{ data: value }}>{children}</Context.Provider>
  );
  Provider.displayName = debugName;

  const useValue: BuildProviderResult<T>['useValue'] = () => {
    const value = React.useContext(Context);
    if (!value && !nullable) {
      throw new Error(`"${debugName}" provider is required to use value, but missing`);
    }
    return value?.data ?? null;
  };

  const useRequireValue: BuildProviderResult<T>['useRequireValue'] = () => {
    const value = useValue();
    if (!value) {
      throw new Error(`"${debugName}" provider value is missing. Did you mean to use "useValue"?`);
    }
    return value;
  };

  return { Provider, useRequireValue, useValue };
};
