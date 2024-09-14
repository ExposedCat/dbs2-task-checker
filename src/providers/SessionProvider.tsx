import { buildProvider } from '~/utils/provider.js';

export type Session = {
  login: string;
};

export const { Provider: ProvideSession, useRequireValue: useSession } = buildProvider<Session>('ProvideSession', true);
