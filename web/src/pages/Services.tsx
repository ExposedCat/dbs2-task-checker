import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { FaSyncAlt } from 'react-icons/fa';
import { Badge } from '~/components/elements/Badge';
import { Button } from '~/components/elements/Button';
import { Flex } from '~/components/elements/Flex';
import { Label } from '~/components/elements/Label';
import { Page } from '~/components/elements/Page.js';
import { ErrorCard } from '~/components/partials/ErrorCard';
import { useGetRequest } from '~/hooks/useGetRequest';

/** Mirrors `InfraReport` on the server */
type ProbeResult = {
  ok: boolean;
  latencyMs: number | null;
  detail: string | null;
};

export type InfraReport = {
  checkedAt: number;
  services: (ProbeResult & { name: string; target: string })[];
  redis: (ProbeResult & { user: string; port: number })[];
};

const REFRESH_INTERVAL_MS = 30_000;

// Same row cards as the Users page
const tableStyles = css({
  borderCollapse: 'separate',
  borderSpacing: '0 {spacing.sm}',
  fontSize: 'sm',
  '& th': {
    paddingX: 'sm',
    textAlign: 'left',
    color: 'text.label',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    fontSize: 'xs',
    whiteSpace: 'nowrap',
  },
  '& td': {
    padding: 'sm',
    verticalAlign: 'middle',
    borderTop: 'base',
    borderBottom: 'base',
  },
  '& td:first-of-type': {
    borderLeft: 'base',
    borderTopLeftRadius: 'common',
    borderBottomLeftRadius: 'common',
  },
  '& td:last-of-type': {
    borderRight: 'base',
    borderTopRightRadius: 'common',
    borderBottomRightRadius: 'common',
  },
});

const monoStyles = css({ fontFamily: 'mono' });

const upBadgeStyles = css({
  backgroundColor: 'light.success',
  borderColor: 'decoration.success',
  color: 'text.success',
});

const downBadgeStyles = css({
  backgroundColor: 'light.error',
  borderColor: 'decoration.error',
  color: 'text.error',
});

const StatusBadge: React.FC<{ ok: boolean; latencyMs: number | null }> = ({ ok, latencyMs }) => (
  <Badge
    text={ok ? `up${latencyMs !== null ? ` · ${latencyMs} ms` : ''}` : 'down'}
    className={ok ? upBadgeStyles : downBadgeStyles}
  />
);

export function ServicesPage() {
  const query = useGetRequest<InfraReport>('/services');

  // The checks are cheap and credential-free, so keep the page current while it is open
  React.useEffect(() => {
    const timer = setInterval(query.refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [query.refetch]);

  const redisSummary = React.useMemo(() => {
    if (!query.data) return null;
    const down = query.data.redis.filter(instance => !instance.ok);
    return { total: query.data.redis.length, down };
  }, [query.data]);

  return (
    <Page>
      <Flex align="center" gap="sm">
        <Label text="Services" kind="header" />
        <Button icon={FaSyncAlt} variant="outline" disabled={query.state === 'loading'} onClick={query.refetch} />
      </Flex>
      {query.state === 'loading' && <Label text="Checking..." />}
      {query.state === 'error' && <ErrorCard error={query.error} />}
      {query.state === 'success' && redisSummary && (
        <Flex direction="column" align="center" gap="sm" maxWidth="container.full">
          <table className={tableStyles}>
            <thead>
              <tr>
                <th>Service</th>
                <th>Target</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {query.data.services.map(service => (
                <tr key={service.name}>
                  <td>
                    <Label text={service.name} />
                  </td>
                  <td>
                    <Label text={service.target} className={monoStyles} />
                  </td>
                  <td>
                    <StatusBadge ok={service.ok} latencyMs={service.latencyMs} />
                  </td>
                  <td>
                    <Label text={service.detail ?? '—'} color={service.ok ? 'normal' : 'error'} />
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <Label text="Redis instances" />
                </td>
                <td>
                  <Label text={`${redisSummary.total} students`} className={monoStyles} />
                </td>
                <td>
                  <Badge
                    text={
                      redisSummary.down.length === 0
                        ? `all ${redisSummary.total} up`
                        : `${redisSummary.total - redisSummary.down.length} up · ${redisSummary.down.length} down`
                    }
                    className={redisSummary.down.length === 0 ? upBadgeStyles : downBadgeStyles}
                  />
                </td>
                <td>
                  {redisSummary.down.length === 0 ? (
                    <Label text="—" />
                  ) : (
                    <Flex gap="xs" wrap="wrap" maxWidth="container.lg">
                      {redisSummary.down.map(instance => (
                        <Badge
                          key={instance.user}
                          preserveCase
                          text={`${instance.user} :${instance.port}`}
                          className={downBadgeStyles}
                          title={instance.detail ?? undefined}
                        />
                      ))}
                    </Flex>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <Label text={`Checked at ${new Date(query.data.checkedAt).toLocaleTimeString()}`} color="normal" />
        </Flex>
      )}
    </Page>
  );
}
