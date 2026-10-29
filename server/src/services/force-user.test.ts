import { expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { Database } from './database';
import { forcedUserName, getForcedUser } from './force-user';

test('FORCE_USER is limited to admin/student in development and ignored in production', () => {
  expect(forcedUserName({ NODE_ENV: 'development', FORCE_USER: 'student' })).toBe('student');
  expect(forcedUserName({ NODE_ENV: 'development', FORCE_USER: 'admin' })).toBe('admin');
  expect(forcedUserName({ NODE_ENV: 'production', FORCE_USER: 'admin' })).toBeNull();
  expect(forcedUserName({ FORCE_USER: 'admin' })).toBeNull();
  expect(forcedUserName({ NODE_ENV: 'development', FORCE_USER: '' })).toBeNull();
  expect(() => forcedUserName({ NODE_ENV: 'development', FORCE_USER: 'other' })).toThrow();
});

test('forced accounts are created automatically, keep their role, and retain progress when switching', async () => {
  const users = new Map<string, any>();
  const database = {
    users: {
      findOneAndUpdate: async ({ user }: { user: string }, { $setOnInsert }: { $setOnInsert: any }, options: any) => {
        expect(options.projection).toEqual({ password: 0 });
        if (!users.has(user)) users.set(user, { _id: new ObjectId(), ...$setOnInsert });
        return users.get(user);
      },
    },
  } as unknown as Database;
  const student = await getForcedUser(database, { NODE_ENV: 'development', FORCE_USER: 'student' });
  expect(student!.admin).toBe(false);
  student!.submissions.push({ datasetId: 'redis', grade: 1, session: [] });
  const admin = await getForcedUser(database, { NODE_ENV: 'development', FORCE_USER: 'admin' });
  expect(admin!.admin).toBe(true);
  expect((await getForcedUser(database, { NODE_ENV: 'development', FORCE_USER: 'student' }))!.submissions).toHaveLength(
    1,
  );
  expect(await getForcedUser({} as Database, { NODE_ENV: 'production', FORCE_USER: 'admin' })).toBeNull();
});
