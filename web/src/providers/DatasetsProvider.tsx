import { buildProvider } from '~/utils/provider.js';

export type Dataset = {
  id: string;
  name: string;
  minPoints: number;
  bank: {
    Question: string;
  }[];
};

export const { Provider: ProvideDatasets, useRequireValue: useDatasets } = buildProvider<{
  datasets: Dataset[];
  refetch: () => void;
}>('ProvideDatasets');
