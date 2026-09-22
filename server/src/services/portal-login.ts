import { randomBytes, createHash } from 'node:crypto';

const TTL_MS = 60_000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

type Challenge = { code: string; expiresAt: number; userId?: string; lastPoll: number };

/** Single API process; restarting it invalidates pending login challenges. */
export class PortalLogin {
  private challenges = new Map<string, Challenge>();
  private byCode = new Map<string, string>();
  private starts: number[] = [];
  constructor(private now = Date.now) {}

  private remove(key: string, challenge: Challenge) {
    this.challenges.delete(key);
    this.byCode.delete(challenge.code);
  }

  create() {
    const now = this.now();
    for (const [key, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.remove(key, challenge);
    }
    this.starts = this.starts.filter(time => time > now - 60_000);
    if (this.starts.length >= 120 || this.challenges.size >= 500)
      throw new Error('Too many login requests; try again shortly');
    this.starts.push(now);
    const pollToken = randomBytes(32).toString('hex');
    const code = randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g)!.join('-');
    const key = digest(pollToken);
    const expiresAt = now + TTL_MS;
    this.challenges.set(key, { code, expiresAt, lastPoll: 0 });
    this.byCode.set(code, key);
    return { code, pollToken, expiresAt };
  }

  approve(code: string, userId: string) {
    const key = this.byCode.get(code);
    const challenge = key ? this.challenges.get(key) : undefined;
    if (!challenge || challenge.expiresAt <= this.now() || challenge.userId) return false;
    challenge.userId = userId;
    return true;
  }

  poll(pollToken: string): { status: 'pending' } | { status: 'approved'; userId: string } {
    const key = digest(pollToken);
    const challenge = this.challenges.get(key);
    if (!challenge || challenge.expiresAt <= this.now()) {
      if (challenge) this.remove(key, challenge);
      throw new Error('Login code expired or already used; generate a new code');
    }
    if (challenge.userId) {
      this.remove(key, challenge); // A single browser token can redeem approval once.
      return { status: 'approved', userId: challenge.userId };
    }
    if (challenge.lastPoll > this.now() - 1000) throw new Error('Please wait before checking again');
    challenge.lastPoll = this.now();
    return { status: 'pending' };
  }
}

export const portalLogin = new PortalLogin();
