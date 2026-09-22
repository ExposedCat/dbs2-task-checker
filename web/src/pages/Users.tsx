import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { FaCheck, FaKey, FaSyncAlt, FaTerminal } from 'react-icons/fa';
import { Badge } from '~/components/elements/Badge';
import { Button } from '~/components/elements/Button';
import { Flex } from '~/components/elements/Flex';
import { Label } from '~/components/elements/Label';
import { Page } from '~/components/elements/Page.js';
import { Popup } from '~/components/elements/Popup';
import { ErrorCard } from '~/components/partials/ErrorCard';
import { useGetRequest } from '~/hooks/useGetRequest';
import { usePostRequest } from '~/hooks/usePostRequest';

/** Mirrors `UserInfo` on the server: infrastructure details and progress, never the password */
export type UserInfo = {
  user: string;
  admin: boolean;
  redis: { port: number | null };
  submissions: { datasetId: string; grade: number }[];
  testSession: { datasetId: string; answered: number; total: number } | null;
};

// Columnar layout, but every row is drawn like the row cards of the Datasets page
// (`border: base`, `rounded: common`, `padding: sm`) with a gap between rows.
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

const prefixMenuStyles = css({
  position: 'absolute',
  top: '100%',
  right: 0,
  marginTop: 'xs',
  padding: 'sm',
  border: 'base',
  borderRadius: 'common',
  backgroundColor: 'white',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
  zIndex: 10,
  minWidth: '180px',
  maxHeight: '300px',
  overflowY: 'auto',
});
const prefixSummaryStyles = css({ cursor: 'pointer', border: 'base', borderRadius: 'common', padding: 'sm' });
const usernamePrefix = (name: string) => name.includes('_') ? name.slice(0, name.indexOf('_')) : '';

const monoStyles = css({ fontFamily: 'mono' });

// On narrow screens the table scrolls horizontally inside its box instead of widening the page
const scrollStyles = css({ overflowX: 'auto' });

/** Best grade per dataset, e.g. "RedisBasic 8 (3×)" when a dataset was attempted three times */
function summarizeSubmissions(submissions: UserInfo['submissions']) {
  const byDataset = new Map<string, { best: number; attempts: number }>();
  for (const { datasetId, grade } of submissions) {
    const current = byDataset.get(datasetId);
    byDataset.set(datasetId, {
      best: Math.max(grade, current?.best ?? Number.NEGATIVE_INFINITY),
      attempts: (current?.attempts ?? 0) + 1,
    });
  }
  return [...byDataset.entries()].map(([datasetId, { best, attempts }]) => ({ datasetId, best, attempts }));
}

async function copyToClipboard(text: string) {
  // The async Clipboard API only exists in secure contexts; the portal is served over plain
  // HTTP, so fall back to the legacy selection-based copy there.
  if (window.isSecureContext && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.focus();
  area.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy command rejected');
  } finally {
    area.remove();
  }
}

/** Copies the command to open a shell as the student on the host */
const CopyLoginButton: React.FC<{ login: string }> = ({ login }) => {
  const [copied, setCopied] = React.useState(false);
  const command = `sudo su - ${login}`;

  const onClick = React.useCallback(() => {
    copyToClipboard(command).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      error => console.error('Copy failed:', error),
    );
  }, [command]);

  return (
    <Button
      icon={copied ? FaCheck : FaTerminal}
      variant="outline"
      colorVariant={copied ? 'success' : 'active'}
      title={`Copy "${command}"`}
      onClick={onClick}
    />
  );
};

/** Confirmation dialog; mounted fresh for every attempt so a previous result is not shown again */
const ResetPasswordDialog: React.FC<{ login: string; onClose: () => void }> = ({ login, onClose }) => {
  const query = usePostRequest<{ message: string }>('/reset-password');
  const onConfirm = React.useCallback(() => query.request({ user: login }), [query.request, login]);

  return (
    <Popup title={`Reset password of ${login}`} open onClose={onClose}>
      {/* The popup grows with its content; keep the text within the popup's minimum width so it wraps */}
      <Flex direction="column" gap="sm" maxWidth="container.lg">
        {query.state !== 'success' && (
          <>
            <Label
              text={`The Linux password of ${login} will be expired: the student has to choose a new password at the next SSH login. Database passwords stay unchanged. Portal login uses SSH approval.`}
            />
            <Button
              colorVariant="error"
              label={`Reset password of ${login}`}
              disabled={query.state === 'loading'}
              onClick={onConfirm}
            />
          </>
        )}
        {query.state === 'success' && <Label text={query.data.message} color="success" />}
        {query.state === 'error' && <ErrorCard error={query.error} />}
      </Flex>
    </Popup>
  );
};

const ResetPasswordButton: React.FC<{ login: string }> = ({ login }) => {
  const [attempt, setAttempt] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const onClose = React.useCallback(() => setOpen(false), []);

  return (
    <>
      {open && <ResetPasswordDialog key={attempt} login={login} onClose={onClose} />}
      <Button
        icon={FaKey}
        variant="outline"
        colorVariant="warning"
        title={`Reset password of ${login}`}
        onClick={() => {
          setAttempt(count => count + 1);
          setOpen(true);
        }}
      />
    </>
  );
};

const UserRow: React.FC<{ info: UserInfo }> = ({ info }) => {
  const submissions = React.useMemo(() => summarizeSubmissions(info.submissions), [info.submissions]);

  return (
    <tr>
      <td>
        <Flex align="center" gap="xs">
          <Label text={info.user} className={monoStyles} />
          {info.admin && <Badge text="admin" />}
        </Flex>
      </td>
      <td>
        {info.redis.port !== null ? (
          <Label text={info.redis.port} className={monoStyles} />
        ) : (
          <Label text="—" color="error" title="No Redis instance assigned" />
        )}
      </td>
      <td>
        {info.testSession ? (
          <Label
            text={`${info.testSession.datasetId} ${info.testSession.answered}/${info.testSession.total}`}
            color="warning"
          />
        ) : (
          <Label text="—" color="normal" />
        )}
      </td>
      <td>
        <Flex gap="xs" wrap="wrap">
          {submissions.length === 0 && <Label text="—" />}
          {submissions.map(({ datasetId, best, attempts }) => (
            <Badge key={datasetId} preserveCase text={`${datasetId} ${best}${attempts > 1 ? ` (${attempts}×)` : ''}`} />
          ))}
        </Flex>
      </td>
      <td>
        <Flex gap="xs">
          <CopyLoginButton login={info.user} />
          <ResetPasswordButton login={info.user} />
        </Flex>
      </td>
    </tr>
  );
};

export function UsersPage() {
  const query = useGetRequest<UserInfo[]>('/users');
  const [prefixes, setPrefixes] = React.useState<string[]>(() => [`f${String(new Date().getFullYear()).slice(-2)}`]);
  const dropdown = React.useRef<HTMLDetailsElement>(null);
  const users = query.state === 'success' ? query.data : [];
  const availablePrefixes = [...new Set(users.map(info => usernamePrefix(info.user)))].sort();
  const visibleUsers = users.filter(info => prefixes.includes(usernamePrefix(info.user)));
  const prefixLabel = (prefix: string) => prefix || 'No prefix';

  React.useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) dropdown.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  return (
    <Page>
      <Flex align="center" gap="sm" wrap="wrap">
        <Label text="Users" kind="header" />
        <Button icon={FaSyncAlt} variant="outline" disabled={query.state === 'loading'} onClick={query.refetch} title="Reload users" aria-label="Reload users" />
        <details ref={dropdown} style={{ position: 'relative' }} onKeyDown={event => {
          if (event.key === 'Escape' && dropdown.current) {
            dropdown.current.open = false;
            dropdown.current.querySelector('summary')?.focus();
          }
        }}>
          <summary className={prefixSummaryStyles} aria-label="Filter users by prefix">
            Prefixes: {prefixes.length ? prefixes.map(prefixLabel).join(', ') : 'None'}
          </summary>
          <div className={prefixMenuStyles}>
            <Flex gap="xs">
              <Button label="All" onClick={() => setPrefixes(availablePrefixes)} />
              <Button label="None" onClick={() => setPrefixes([])} />
            </Flex>
            {availablePrefixes.map(prefix => (
              <label key={prefix} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={prefixes.includes(prefix)} onChange={event => {
                  setPrefixes(current => event.target.checked
                    ? [...current, prefix].sort()
                    : current.filter(value => value !== prefix));
                }} />
                {prefixLabel(prefix)}
              </label>
            ))}
          </div>
        </details>
      </Flex>
      {query.state === 'loading' && <Label text="Loading..." />}
      {query.state === 'error' && <ErrorCard error={query.error} />}
      {query.state === 'success' && query.data.length === 0 && <Label text="There are no users yet" />}
      {query.state === 'success' && users.length > 0 && visibleUsers.length === 0 && <Label text="No users match the selected prefixes" />}
      {query.state === 'success' && visibleUsers.length > 0 && (
        <Flex maxWidth="container.full" direction="column" align="center" className={scrollStyles}>
          <table className={tableStyles}>
            <thead>
              <tr>
                <th>Login</th>
                <th>Redis port</th>
                <th>Active test</th>
                <th>Submissions (best grade)</th>
                <th title="Copy the shell login command · reset the Linux password">Account</th>
              </tr>
            </thead>
            <tbody>
              {/* Logins are not unique in the collection (legacy duplicate records), hence the index */}
              {visibleUsers.map((info, index) => (
                <UserRow key={`${index}-${info.user}`} info={info} />
              ))}
            </tbody>
          </table>
        </Flex>
      )}
    </Page>
  );
}
