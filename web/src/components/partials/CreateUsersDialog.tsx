import React from 'react';
import { FaPlus, FaTrash } from 'react-icons/fa';
import { Button } from '../elements/Button';
import { Flex } from '../elements/Flex';
import { Input } from '../elements/Input';
import { Label } from '../elements/Label';
import { Popup } from '../elements/Popup';
import { ErrorCard } from './ErrorCard';
import { useSessionToken } from '~/hooks/useSessionToken';
import { httpRequest } from '~/services/http';

export function CreateUsersDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (users: string[]) => void }) {
  const token = useSessionToken();
  const nextId = React.useRef(1);
  const [rows, setRows] = React.useState([{ id: 0, name: '', password: '' }]);
  const [fileText, setFileText] = React.useState('');
  const [readingFile, setReadingFile] = React.useState(false);
  const fileVersion = React.useRef(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const update = (id: number, field: 'name' | 'password', value: string) =>
    setRows(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || readingFile) return;
    setError(null);
    setSubmitting(true);
    const result = await httpRequest<{ users: string[] }>({
      path: '/create-users', method: 'POST', contentType: 'json', authorization: token,
      body: { users: rows.filter(row => row.name || row.password).map(({ name, password }) => ({ name, password })), fileText },
    });
    setSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    onCreated(result.data.users);
    onClose();
  };

  return (
    <Popup title="Create users" open onClose={() => { if (!submitting) onClose(); }}>
      <form onSubmit={submit}>
        <Flex direction="column" gap="sm" maxWidth="container.lg">
          <Label text={`Enter a name and password, or upload a TXT file with one name:password per line. Short names receive the f${String(new Date().getFullYear()).slice(-2)}_ prefix; full logins keep theirs. Passwords need at least 6 characters.`} />
          <Label text="To retry a failed creation, enter the same login and password." />
          <Flex direction="column" gap="xs" maxHeight="300px" overflowY="auto">
            {rows.map((row, index) => (
              <Flex key={row.id} gap="xs" align="center">
                <Input aria-label={`Name ${index + 1}`} placeholder="Name" autoComplete="off" value={row.name} disabled={submitting}
                  onValueChange={value => update(row.id, 'name', value)} />
                <Input aria-label={`Password ${index + 1}`} placeholder="Password" type="password" autoComplete="new-password" value={row.password} disabled={submitting}
                  onValueChange={value => update(row.id, 'password', value)} />
                <Button type="button" icon={FaTrash} title="Remove row" aria-label={`Remove row ${index + 1}`} variant="outline" colorVariant="error" disabled={submitting}
                  onClick={() => setRows(current => current.filter(item => item.id !== row.id))} />
              </Flex>
            ))}
          </Flex>
          <Button type="button" icon={FaPlus} label="Add row" variant="outline" disabled={submitting || rows.length >= 500}
            onClick={() => setRows(current => [...current, { id: nextId.current++, name: '', password: '' }])} />
          <label>
            <Label text="Upload TXT file" />
            <Input type="file" accept=".txt,text/plain" aria-label="Upload TXT file" disabled={submitting} onChange={async event => {
              const file = event.currentTarget.files?.[0];
              const version = ++fileVersion.current;
              setError(null);
              setFileText('');
              setReadingFile(true);
              try {
                if (file && file.size > 900000) throw new Error('TXT file must be smaller than 900 KB');
                const text = file ? await file.text() : '';
                if (version === fileVersion.current) setFileText(text);
              } catch (error) {
                if (version === fileVersion.current) setError(String(error));
              } finally {
                if (version === fileVersion.current) setReadingFile(false);
              }
            }} />
          </label>
          {error && <ErrorCard error={error} />}
          <Flex gap="sm">
            <Button type="button" label="Cancel" variant="outline" disabled={submitting} onClick={onClose} />
            <Button type="submit" label={submitting ? 'Adding…' : 'Create users'} colorVariant="success"
              disabled={submitting || readingFile || (!fileText && !rows.some(row => row.name || row.password))} />
          </Flex>
        </Flex>
      </form>
    </Popup>
  );
}
