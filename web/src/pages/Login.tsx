import React from 'react';
import { setSessionToken } from '~/services/session.js';
import { httpRequest } from '~/services/http.js';
import { Page } from '~/components/elements/Page.js';
import { Label } from '~/components/elements/Label.js';
import { Button } from '~/components/elements/Button.js';

type Challenge = { command: string; code: string; pollToken: string; expiresAt: number };
type Poll = { status: 'pending' } | { status: 'approved'; token: string };

export function LoginPage() {
  const [challenge, setChallenge] = React.useState<Challenge | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const generation = React.useRef(0);
  const [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState<string | null>(null);

  const start = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setChallenge(null);
    setCopied(false);
    setCopyError(null);
    const result = await httpRequest<Challenge>({
      path: '/login/start',
      method: 'POST',
      contentType: 'json',
      authorization: null,
      body: {},
    });
    if (generation.current !== current) return;
    setLoading(false);
    if (result.ok) {
      setNow(Date.now());
      setChallenge(result.data);
    } else setError(result.error);
  }, []);

  React.useEffect(() => {
    void start();
    return () => { generation.current++; };
  }, [start]);

  const copy = async () => {
    if (!challenge) return;
    const text = `${challenge.command} ${challenge.code}`;
    setCopyError(null);
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // The deployed portal uses HTTP, where the Clipboard API is unavailable.
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        const focused = document.activeElement;
        try {
          textarea.select();
          if (!document.execCommand('copy')) throw new Error('Copy unavailable');
        } finally {
          textarea.remove();
          if (focused instanceof HTMLElement) focused.focus();
        }
      }
      setCopied(true);
    } catch {
      setCopyError('Select the command and copy it manually.');
    }
  };

  React.useEffect(() => {
    if (!challenge) return;
    let stopped = false;
    let pollTimer: ReturnType<typeof setTimeout>;
    const current = generation.current;
    const renew = () => {
      if (stopped || generation.current !== current) return;
      stopped = true;
      clearTimeout(pollTimer);
      void start();
    };
    // The countdown and expiration do not depend on polling/network latency.
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= challenge.expiresAt) renew();
    };
    const clock = setInterval(tick, 1000);
    const expiration = setTimeout(renew, Math.max(0, challenge.expiresAt - Date.now()));
    const poll = async () => {
      const result = await httpRequest<Poll>({
        path: '/login/poll',
        method: 'POST',
        contentType: 'json',
        authorization: null,
        body: { pollToken: challenge.pollToken },
      });
      if (stopped || generation.current !== current) return;
      if (Date.now() >= challenge.expiresAt) {
        renew();
        return;
      }
      if (result.ok && result.data.status === 'approved') {
        stopped = true;
        clearInterval(clock);
        clearTimeout(expiration);
        setSessionToken(result.data.token);
        return;
      }
      if (!result.ok) setError(result.error);
      else setError(null);
      pollTimer = setTimeout(poll, 2000);
    };
    pollTimer = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      clearTimeout(pollTimer);
      clearInterval(clock);
      clearTimeout(expiration);
    };
  }, [challenge, start]);

  React.useEffect(() => {
    if (challenge || loading || !error) return;
    const retry = setTimeout(start, 5000);
    return () => clearTimeout(retry);
  }, [challenge, loading, error, start]);

  return (
    <Page>
      <Label text="Welcome to the DBS2 Portal" kind="header" />

      {challenge && (
        <>
          <Label text="Paste this command on a server via SSH:" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, border: '1px solid currentColor', borderRadius: 8, maxWidth: '100%', flexWrap: 'wrap' }}>
            <code style={{ userSelect: 'all', overflowWrap: 'anywhere', flex: '1 1 240px' }}>
              {challenge.command} {challenge.code}
            </code>
            <Button label={copied ? 'Copied!' : 'Copy'} onClick={copy} aria-label="Copy login command" />
          </div>
          {copyError && <Label role="status" text={copyError} />}
          <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
            {copied ? 'Command copied' : ''}
          </span>
          {!error && (
            <Label
              text={`Expires in ${Math.max(0, Math.ceil((challenge.expiresAt - now) / 1000))} seconds`}
            />
          )}
        </>
      )}
      {error && <Label role="alert" text={error} color="error" />}
      {loading && <Label text="Generating code…" />}
    </Page>
  );
}
