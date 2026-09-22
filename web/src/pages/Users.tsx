import { css } from '@styled-system/css/css.mjs';
import React from 'react';
import { FaCheck, FaChevronDown, FaChevronUp, FaKey, FaPlus, FaSyncAlt, FaTerminal, FaTrash } from 'react-icons/fa';
import { Badge } from '~/components/elements/Badge';
import { Button } from '~/components/elements/Button';
import { Flex } from '~/components/elements/Flex';
import { Label } from '~/components/elements/Label';
import { Page } from '~/components/elements/Page.js';
import { Popup } from '~/components/elements/Popup';
import { CreateUsersDialog } from '~/components/partials/CreateUsersDialog';
import { ErrorCard } from '~/components/partials/ErrorCard';
import { useGetRequest } from '~/hooks/useGetRequest';
import { usePostRequest } from '~/hooks/usePostRequest';
import { useSessionToken } from '~/hooks/useSessionToken';
import { httpRequest } from '~/services/http';

/** Mirrors `UserInfo` on the server: infrastructure details and progress, never the password */
export type UserInfo = {
  user: string;
  admin: boolean;
  created: boolean;
  creationError: string | null;
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
  '& tr[data-creating=true] td, & tr[data-creating=true] td *': { color: 'text.success' },
  '& tr[data-deleting=true] td, & tr[data-deleting=true] td *': { color: 'text.error' },
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
  width: '240px',
  maxWidth: 'calc(100vw - 32px)',
  maxHeight: '300px',
  overflowY: 'auto',
});
const prefixOptionStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: 'sm',
  padding: 'sm',
  borderRadius: 'common',
  cursor: 'pointer',
  fontSize: 'sm',
  _hover: { backgroundColor: 'light.gray' },
  '&[data-selected=true]': { backgroundColor: 'light.active', color: 'text.active' },
  _focusWithin: { outline: '2px solid token(colors.decoration.active)', outlineOffset: '1px' },
  '& input': { width: '16px', height: '16px', accentColor: 'dark.active', cursor: 'pointer' },
});
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
const CopyLoginButton: React.FC<{ login: string; disabled?: boolean }> = ({ login, disabled }) => {
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
      disabled={disabled}
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

const ResetPasswordButton: React.FC<{ login: string; disabled?: boolean }> = ({ login, disabled }) => {
  const [attempt, setAttempt] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const onClose = React.useCallback(() => setOpen(false), []);

  return (
    <>
      {open && !disabled && <ResetPasswordDialog key={attempt} login={login} onClose={onClose} />}
      <Button
        disabled={disabled}
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

type DeletionState = { state: 'loading' | 'success' | 'error'; error?: string };

const UserRow: React.FC<{ info: UserInfo; deletion?: DeletionState; onDelete: (login: string) => void }> = ({ info, deletion, onDelete }) => {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const deleting = deletion?.state === 'loading';
  const creating = info.created === false;
  const disabled = creating || deleting || deletion?.state === 'success';
  const submissions = React.useMemo(() => summarizeSubmissions(info.submissions), [info.submissions]);

  return (
    <tr data-deleting={deleting} data-creating={creating} aria-busy={deleting || (creating && !info.creationError)}>
      <td>
        <Flex align="center" gap="xs">
          <Label text={info.user} className={monoStyles} />
          {info.admin && <Badge text="admin" />}
          {creating && <Badge tone="success" text={info.creationError ? "Creation failed" : "Creating…"} />}
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
          <CopyLoginButton login={info.user} disabled={disabled} />
          <ResetPasswordButton login={info.user} disabled={disabled} />
          <Button icon={FaTrash} aria-label={deleting ? `Deleting ${info.user}` : `Delete account ${info.user}`}
            variant="outline" colorVariant="error" disabled={disabled}
            title={`Delete account ${info.user}`} onClick={() => setConfirmOpen(true)} />
        </Flex>
        {info.creationError && <Flex marginTop="xs"><ErrorCard error={info.creationError} /></Flex>}
        {deletion?.state === 'error' && <Flex marginTop="xs"><ErrorCard error={deletion.error} /></Flex>}
        {confirmOpen && (
          <Popup title={`Delete ${info.user}?`} open onClose={() => setConfirmOpen(false)}>
            <Flex direction="column" gap="sm" maxWidth="container.lg">
              <Label text={`Permanently delete ${info.user}'s Linux account, home directory, database resources, portal account, and submissions? This cannot be undone.`} />
              <Flex gap="sm">
                <Button label="Cancel" variant="outline" onClick={() => setConfirmOpen(false)} />
                <Button label={`Delete ${info.user}`} colorVariant="error" onClick={() => {
                  setConfirmOpen(false);
                  onDelete(info.user);
                }} />
              </Flex>
            </Flex>
          </Popup>
        )}
      </td>
    </tr>
  );
};

export function UsersPage() {
  const query = useGetRequest<UserInfo[]>('/users');
  const token = useSessionToken();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deletions, setDeletions] = React.useState<Record<string, DeletionState>>({});
  const pending = React.useRef(new Set<string>());
  const deletionQueue = React.useRef<Promise<void>>(Promise.resolve());
  const deleteUser = (login: string) => {
    if (pending.current.has(login) || deletions[login]?.state === 'success') return;
    pending.current.add(login);
    setDeletions(current => ({ ...current, [login]: { state: 'loading' } }));
    // Keep every selected row busy immediately, but send one deletion at a time.
    // This avoids spending the HTTP timeout waiting for another provisioning job.
    deletionQueue.current = deletionQueue.current.then(async () => {
      try {
        const result = await httpRequest<{ message: string }>({
          method: 'POST', path: '/delete-user', authorization: token, contentType: 'json', body: { user: login },
        });
        setDeletions(current => ({ ...current, [login]: result.ok
          ? { state: 'success' } : { state: 'error', error: result.error } }));
        if (result.ok) query.refetch();
      } catch (error) {
        setDeletions(current => ({ ...current, [login]: { state: 'error', error: String(error) } }));
      } finally {
        pending.current.delete(login);
      }
    });
  };
  const [prefixes, setPrefixes] = React.useState<string[]>(() => [`f${String(new Date().getFullYear()).slice(-2)}`]);
  const dropdown = React.useRef<HTMLDivElement>(null);
  const [prefixMenuOpen, setPrefixMenuOpen] = React.useState(false);
  const prefixMenuId = React.useId();
  const users = query.state === 'success' ? query.data.filter(info => deletions[info.user]?.state !== 'success') : [];
  const availablePrefixes = [...new Set(users.map(info => usernamePrefix(info.user)))].sort();
  const visibleUsers = users.filter(info => prefixes.includes(usernamePrefix(info.user)));
  const deletableUsers = visibleUsers.filter(info => info.created !== false);
  const creatingUsers = users.some(info => info.created === false && !info.creationError);
  React.useEffect(() => {
    if (!creatingUsers) return;
    const timer = setInterval(query.refetch, 2000);
    return () => clearInterval(timer);
  }, [creatingUsers, query.refetch]);
  const prefixLabel = (prefix: string) => prefix || 'No prefix';
  const [bulkDeletion, setBulkDeletion] = React.useState<{ prefixes: string[]; logins: string[] } | null>(null);
  const deletionInProgress = Object.values(deletions).some(deletion => deletion.state === 'loading');

  React.useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) setPrefixMenuOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  return (
    <Page>
      <Flex align="center" gap="sm" wrap="wrap">
        <Label text="Users" kind="header" />
        <Button icon={FaSyncAlt} variant="outline" disabled={query.state === 'loading'} onClick={query.refetch} title="Reload users" aria-label="Reload users" />
        <Button icon={FaPlus} variant="outline" colorVariant="success" title="Create users" aria-label="Create users" onClick={() => setCreateOpen(true)} />
        <div ref={dropdown} style={{ position: 'relative' }} onKeyDown={event => {
          if (event.key === 'Escape') {
            setPrefixMenuOpen(false);
            dropdown.current?.querySelector('button')?.focus();
          }
        }}>
          <Button
            variant="outline"
            style={{ lineHeight: 1 }}
            icon={prefixMenuOpen ? FaChevronUp : FaChevronDown}
            reverse
            label={`Prefixes · ${prefixes.length === 1 ? prefixLabel(prefixes[0]) : prefixes.length ? `${prefixes.length} selected` : 'None'}`}
            aria-label="Filter users by prefix"
            aria-expanded={prefixMenuOpen}
            aria-controls={prefixMenuId}
            onClick={() => setPrefixMenuOpen(open => !open)}
          />
          {prefixMenuOpen && (
            <div id={prefixMenuId} className={prefixMenuStyles} role="group" aria-label="Username prefixes">
              <Flex justify="space-between" align="center" gap="xs" marginBottom="xs" paddingBottom="xs" borderBottom="base">
                <Label text="Prefixes" />
                <Flex gap="xs">
                  <Button variant="ghost" label="All" onClick={() => setPrefixes(availablePrefixes)} />
                  <Button variant="ghost" label="None" onClick={() => setPrefixes([])} />
                </Flex>
              </Flex>
              <Flex direction="column" gap="xs">
                {availablePrefixes.map(prefix => (
                  <label key={prefix} className={prefixOptionStyles} data-selected={prefixes.includes(prefix)}>
                    <input type="checkbox" checked={prefixes.includes(prefix)} onChange={event => {
                      const checked = event.target.checked;
                      setPrefixes(current => checked
                        ? [...current, prefix].sort()
                        : current.filter(value => value !== prefix));
                    }} />
                    {prefixLabel(prefix)}
                  </label>
                ))}
              </Flex>
            </div>
          )}
        </div>
        <Button
          icon={FaTrash}
          variant="outline"
          colorVariant="error"
          title="Delete all users with selected prefixes"
          aria-label="Delete all users with selected prefixes"
          disabled={query.state !== 'success' || deletableUsers.length === 0 || deletionInProgress}
          onClick={() => {
            setPrefixMenuOpen(false);
            setBulkDeletion({ prefixes: [...prefixes], logins: [...new Set(deletableUsers.map(info => info.user))] });
          }}
        />
      </Flex>
      {createOpen && <CreateUsersDialog onClose={() => setCreateOpen(false)} onCreated={logins => {
        setPrefixes(current => [...new Set([...current, ...logins.map(usernamePrefix)])].sort());
        setDeletions(current => Object.fromEntries(Object.entries(current).filter(([login]) => !logins.includes(login))));
        query.refetch();
      }} />}
      {bulkDeletion && (
        <Popup title={`Delete ${bulkDeletion.logins.length} accounts?`} open onClose={() => setBulkDeletion(null)}>
          <Flex direction="column" gap="sm" maxWidth="container.lg">
            <Label text={`Permanently delete all ${bulkDeletion.logins.length} ready accounts with prefixes: ${bulkDeletion.prefixes.map(prefixLabel).join(', ')}? Their Linux accounts, home directories, database resources, portal accounts, and submissions will be deleted. This cannot be undone.`} />
            <Flex direction="column" gap="xs" maxHeight="240px" overflowY="auto">
              {bulkDeletion.logins.map(login => <Label key={login} text={login} className={monoStyles} />)}
            </Flex>
            <Flex gap="sm">
              <Button label="Cancel" variant="outline" onClick={() => setBulkDeletion(null)} />
              <Button label={`Delete ${bulkDeletion.logins.length} accounts`} colorVariant="error" onClick={() => {
                const { logins } = bulkDeletion;
                setBulkDeletion(null);
                for (const login of logins) deleteUser(login);
              }} />
            </Flex>
          </Flex>
        </Popup>
      )}
      {query.state === 'loading' && <Label text="Loading..." />}
      {query.state === 'error' && <ErrorCard error={query.error} />}
      {query.state === 'success' && users.length === 0 && <Label text="There are no users yet" />}
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
                <th title="Copy the shell login command · reset the Linux password · delete account">Account</th>
              </tr>
            </thead>
            <tbody>
              {/* Logins are not unique in the collection (legacy duplicate records), hence the index */}
              {visibleUsers.map(info => (
                <UserRow key={`${info.user}-${users.filter(user => user.user === info.user).indexOf(info)}`} info={info} deletion={deletions[info.user]} onDelete={deleteUser} />
              ))}
            </tbody>
          </table>
        </Flex>
      )}
    </Page>
  );
}
