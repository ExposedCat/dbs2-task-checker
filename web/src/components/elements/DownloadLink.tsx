import { BASE_API_URL } from '~/services/http.js';

export type DownloadLinkProps = {
  path: string;
};

export const DownloadLink: React.FC<React.PropsWithChildren<DownloadLinkProps>> = ({ path, children }) => (
  <a target="_blank" referrerPolicy="no-referrer" href={`${BASE_API_URL}${path}`} rel="noreferrer">
    {children}
  </a>
);
