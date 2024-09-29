import { buildProvider } from '~/utils/provider.js';

export type Session = {
  login: string;
  testSession: {
    kind: string;
    datasetId: string;
    question: string;
    questionNumber: number;
    questionTotal: number;
  } | null;
};

export const { Provider: ProvideSession, useRequireValue: useSession } = buildProvider<{
  session: Session;
  refetch: () => void;
}>('ProvideSession', true);
