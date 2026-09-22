import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { FaChevronDown, FaChevronUp, FaSyncAlt } from 'react-icons/fa';
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
  redis: (ProbeResult & { user: string; port: number | null; status: 'up' | 'down' | 'unconfigured' })[];
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
    verticalAlign: 'top',
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

const StatusBadge: React.FC<{ ok: boolean; latencyMs: number | null }> = ({ ok, latencyMs }) => (
  <Badge
    text={ok ? `up${latencyMs !== null ? ` · ${latencyMs} ms` : ''}` : 'down'}
    tone={ok ? 'success' : 'error'}
  />
);

export function ServicesPage() {
  const query = useGetRequest<InfraReport>('/services');
  const [redisExpanded, setRedisExpanded] = React.useState(false);
  const redisDetailsId = React.useId();

  // The checks are cheap and credential-free, so keep the page current while it is open
  React.useEffect(() => {
    const timer = setInterval(query.refetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [query.refetch]);

  const redisSummary = React.useMemo(() => {
    if (!query.data) return null;
    const up = query.data.redis.filter(instance => instance.ok).length;
    const unconfigured = query.data.redis.filter(instance => instance.status === 'unconfigured').length;
    return { total: query.data.redis.length, up, down: query.data.redis.length - up - unconfigured, unconfigured };
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
                  <StatusBadge ok={redisSummary.total > 0 && redisSummary.up === redisSummary.total} latencyMs={null} />
                </td>
                <td>
                  <Flex direction="column" align="start" gap="sm" maxWidth="container.lg">
                    <Button
                      variant="outline"
                      style={{ lineHeight: 1 }}
                      icon={redisExpanded ? FaChevronUp : FaChevronDown}
                      reverse
                      label={`${redisSummary.up} up · ${redisSummary.down} down${redisSummary.unconfigured ? ` · ${redisSummary.unconfigured} unconfigured` : ''}`}
                      aria-label="Toggle student Redis details"
                      aria-expanded={redisExpanded}
                      aria-controls={redisDetailsId}
                      onClick={() => setRedisExpanded(expanded => !expanded)}
                    />
                    {redisExpanded && (
                      <Flex id={redisDetailsId} direction="column" gap="sm">
                        <Label text="Green: reachable · Yellow: no port assigned · Red: unavailable" />
                        <Flex gap="xs" wrap="wrap">
                          {query.data.redis.map((instance, index) => (
                            <Badge
                              key={`${instance.user}-${index}`}
                              preserveCase
                              text={instance.user}
                              tone={instance.ok ? 'success' : instance.status === 'unconfigured' ? 'warning' : 'error'}
                              title={`${instance.user}${instance.port ? ` :${instance.port}` : ''} — ${instance.ok ? 'UP' : instance.status === 'unconfigured' ? 'No Redis port assigned' : 'DOWN'}${instance.detail ? `: ${instance.detail}` : ''}`}
                            />
                          ))}
                        </Flex>
                      </Flex>
                    )}
                  </Flex>
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
