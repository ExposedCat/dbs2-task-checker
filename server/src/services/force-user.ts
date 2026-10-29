import type { Database } from './database';

type Environment = { NODE_ENV?: string; FORCE_USER?: string };

export function forcedUserName(environment: Environment = process.env): 'admin' | 'student' | null {
  if (environment.NODE_ENV !== 'development' || !environment.FORCE_USER) return null;
  if (environment.FORCE_USER !== 'admin' && environment.FORCE_USER !== 'student') {
    throw new Error('FORCE_USER must be admin or student');
  }
  return environment.FORCE_USER;
}

/** Local override uses a real, persistent account so progress and permissions behave normally. */
export async function getForcedUser(database: Database, environment: Environment = process.env) {
  const user = forcedUserName(environment);
  if (!user) return null;
  return database.users.findOneAndUpdate(
    { user },
    {
      $setOnInsert: {
        user,
        admin: user === 'admin',
        created: true,
        port: 0,
        testSession: null,
        submissions: [],
      },
    },
    { upsert: true, returnDocument: 'after', projection: { password: 0 } },
  );
}
