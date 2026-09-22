import { ObjectId } from 'mongodb';
import type { WithId } from 'mongodb';

import type { Database } from './database';
import type { Dataset } from './dataset';
import { execute } from './execute/index';
import { executionDatasetHash } from './execute/dataset-identity';
import { getOrComputeReference } from './reference-cache';
import type { BaseExecuteArgs, DatasetName } from './execute/index';
import type { ServiceResponse } from './response';

export type Submission = {
  datasetId: DatasetName;
  grade: number;
  session: TestSession['tasks'];
};

export type User = {
  user: string;
  port: number;
  testSession: TestSession | null;
  submissions: Submission[];
  admin: boolean;
};

export type TestSession = {
  datasetId: DatasetName;
  tasks: {
    kind: string;
    question: string;
    solution: string[];
    response: string | null;
    testResponse: string | null;
    userSolution: string[] | null;
    userResponse: string | null;
    userTestResponse: string | null;
    test: string | null;
    correct: boolean;
  }[];
};

export type GetUserArgs = {
  database: Database;
  userId: string;
};

export async function getUser(args: GetUserArgs) {
  const { database, userId } = args;

  try {
    return await database.users.findOne({ _id: new ObjectId(userId) }, { projection: { password: 0 } });
  } catch {
    return null;
  }
}

/** Everything an admin may see about a user: infrastructure details and progress, never the password */
export type UserInfo = {
  user: string;
  admin: boolean;
  /**
   * `port` is null for legacy records that were never assigned a Redis instance. Everything
   * else a student owns (sandbox MongoDB database, PostgreSQL database, Cassandra keyspace) is
   * simply named after the login, so it is not repeated here.
   */
  redis: { port: number | null };
  submissions: { datasetId: DatasetName; grade: number }[];
  testSession: { datasetId: DatasetName; answered: number; total: number } | null;
};

export type ListUsersArgs = {
  database: Database;
};

export async function listUsers({ database }: ListUsersArgs): Promise<ServiceResponse<UserInfo[]>> {
  // The password is excluded at the query level so it can never end up in the response
  const users = await database.users
    .find<Omit<User, 'password'>>({}, { projection: { password: 0 }, sort: { user: 1 } })
    .toArray();

  return {
    ok: true,
    error: null,
    data: users.map(user => ({
      user: user.user,
      admin: user.admin ?? false,
      redis: { port: user.port ?? null },
      submissions: (user.submissions ?? []).map(({ datasetId, grade }) => ({ datasetId, grade })),
      testSession: user.testSession
        ? {
            datasetId: user.testSession.datasetId,
            answered: user.testSession.tasks.filter(task => task.userSolution !== null).length,
            total: user.testSession.tasks.length,
          }
        : null,
    })),
  };
}

export type QuitTestSessionArgs = {
  database: Database;
  user: WithId<User>;
  force?: boolean;
};

export async function quitTestSession({
  database,
  user,
  force = false,
}: QuitTestSessionArgs): Promise<ServiceResponse<{ grade: number | null; wrong: string[] }>> {
  if (!user.testSession) {
    return { ok: false, error: 'Test Session was not started', data: null };
  }

  const grade =
    force || user.testSession.tasks.at(-1)?.userSolution !== null
      ? user.testSession.tasks.reduce((score, task) => score + Number(task.correct), 0)
      : null;

  const wrong = user.testSession.tasks.filter(task => !task.correct).map(task => task.question);

  if (grade !== null) {
    await database.users.updateOne(
      { user: user.user },
      {
        $push: {
          submissions: {
            datasetId: user.testSession.datasetId,
            grade,
            session: user.testSession!.tasks,
          },
        },
        $set: {
          testSession: null,
        },
      },
    );
  }

  return { ok: true, error: null, data: { grade, wrong } };
}

export type StartTestSessionArgs = {
  database: Database;
  user: WithId<User>;
  datasetId: DatasetName;
  minPoints: number;
  cathegories: Record<string, number>;
};

export type StartTestSessionResponse =
  | {
      ok: true;
      data: {
        firstQuestion: string;
        response: string;
      };
      error: null;
    }
  | {
      ok: false;
      data: null;
      error: string;
    };

export async function startTestSession({
  database,
  user,
  datasetId,
  cathegories,
  minPoints,
}: StartTestSessionArgs): Promise<StartTestSessionResponse> {
  if (user.testSession) {
    return { ok: false, error: 'Test session is already started', data: null };
  }

  if (user.submissions.some(submission => submission.datasetId === datasetId && submission.grade >= minPoints)) {
    return {
      ok: false,
      error: 'Test for this dataset is already passed',
      data: null,
    };
  }

  const maxLimit = Math.max(...Object.values(cathegories));

  const groups = await database.datasets
    .aggregate<{
      kind: string;
      bank: Dataset['bank'];
    }>([
      { $match: { id: datasetId } },
      { $unwind: { path: '$bank' } },
      { $addFields: { random: { $rand: {} } } },
      { $sort: { random: 1 } },
      {
        $group: {
          _id: '$bank.kind',
          bank: { $push: '$bank' },
        },
      },
      {
        $project: {
          _id: 0,
          kind: '$_id',
          bank: { $slice: ['$bank', maxLimit] },
        },
      },
    ])
    .toArray();

  const sessionBank: Dataset['bank'] = [];
  for (const { kind, bank } of groups) {
    const limit = cathegories[kind];
    if (limit) {
      sessionBank.push(...bank.slice(0, limit));
    }
  }

  if (sessionBank.length === 0) {
    return {
      ok: false,
      error: 'No questions were found by criteria',
      data: null,
    };
  }

  const tasks = sessionBank.map<TestSession['tasks'][number]>(item => ({
    ...item,
    userSolution: null,
    response: null,
    testResponse: null,
    userResponse: null,
    userTestResponse: null,
    correct: false,
  }));

  await database.users.updateOne(
    { _id: user._id },
    {
      $set: {
        testSession: {
          datasetId,
          tasks,
        },
      },
    },
  );

  return {
    ok: true,
    data: {
      firstQuestion: tasks[0].question,
      response: `'${datasetId}' test session started`,
    },
    error: null,
  };
}

export type ExecuteQuestionArgs = BaseExecuteArgs & {
  database: Database;
  user: User;
};

export type ExecuteQuestionResult = ServiceResponse<{
  result: number | null;
  wrong: string[];
}>;

export async function executeQuestion({
  database,
  user,
  queries,
}: ExecuteQuestionArgs): Promise<ExecuteQuestionResult> {
  if (!user.testSession) {
    return { ok: false, error: 'Test session is not started', data: null };
  }

  const { datasetId, tasks } = user.testSession;
  const currentTaskIndex = tasks.findIndex(task => !task.userSolution);
  if (currentTaskIndex === -1) {
    return {
      ok: false,
      error: 'All questions have already been answered',
      data: null,
    };
  }
  const currentTask = tasks[currentTaskIndex];

  const normalizedQueries = queries.map(query => query.trim()).filter(query => query.length > 0);

  const error500: ExecuteQuestionResult = {
    ok: false,
    error: 'Failed to test task. Please report to your teacher',
    data: null,
  };

  const finalizeTask = async ({
    userSolution,
    correct,
    response,
    testResponse,
    userResponse,
    userTestResponse,
  }: {
    userSolution: string[];
    correct: boolean;
    response: string | null;
    testResponse: string | null;
    userResponse: string | null;
    userTestResponse: string | null;
  }): Promise<ExecuteQuestionResult> => {
    const newUser = await database.users.findOneAndUpdate(
      { user: user.user },
      {
        $set: {
          [`testSession.tasks.${currentTaskIndex}.userSolution`]: userSolution,
          [`testSession.tasks.${currentTaskIndex}.correct`]: correct,
          [`testSession.tasks.${currentTaskIndex}.response`]: response,
          [`testSession.tasks.${currentTaskIndex}.testResponse`]: testResponse,
          [`testSession.tasks.${currentTaskIndex}.userResponse`]: userResponse,
          [`testSession.tasks.${currentTaskIndex}.userTestResponse`]: userTestResponse,
        },
      },
      {
        returnDocument: 'after',
      },
    );

    if (!newUser) return error500;

    const quitResult = await quitTestSession({ database, user: newUser });
    if (!quitResult.ok) {
      return quitResult;
    }

    return {
      ok: true,
      data: {
        result: quitResult.data.grade,
        wrong: quitResult.data.wrong,
      },
      error: null,
    };
  };

  if (normalizedQueries.length === 0) {
    return await finalizeTask({
      userSolution: [],
      correct: false,
      response: null,
      testResponse: null,
      userResponse: null,
      userTestResponse: null,
    });
  }

  const getFinalResponse = async (response: string): Promise<ServiceResponse<{ response: string }>> => {
    if (!currentTask.test) {
      return { ok: true, data: { response }, error: null };
    }

    const result = await execute({
      datasetId,
      queries: [currentTask.test],
      noReset: true,
    });

    if (!result.ok) {
      console.error('Failed to get final response', result.error);
      return error500;
    }

    return result;
  };

  // Cache the exact task snapshot used by this session, not the current question bank.
  // Hash again after execution to reject dataset edits during a grading operation.
  const datasetHash = await executionDatasetHash(datasetId);
  const assertDatasetUnchanged = async () => {
    if ((await executionDatasetHash(datasetId)) !== datasetHash) {
      throw new Error('Dataset changed during grading; please retry');
    }
  };
  const reference = await getOrComputeReference(
    database.referenceCache,
    {
      datasetId,
      datasetHash,
      solution: currentTask.solution,
      test: currentTask.test,
      executorVersion: process.env.REFERENCE_CACHE_VERSION ?? 'executor-v1',
      scope: 'shared-private-grading-v1',
    },
    async () => {
      const correctResult = await execute({ datasetId, queries: currentTask.solution });
      if (!correctResult.ok || correctResult.data.skipped) {
        throw new Error('Failed to execute reference solution. Please report to your teacher');
      }
      const correctTest = await getFinalResponse(correctResult.data.response);
      if (!correctTest.ok) throw new Error('Failed to verify reference solution. Please report to your teacher');
      await assertDatasetUnchanged();
      return {
        response: correctResult.data.response.trim(),
        testResponse: currentTask.test ? correctTest.data.response.trim() : null,
      };
    },
  );

  // Reference execution (on a miss) is complete before student code starts. This call
  // always resets/reloads, so reference mutations cannot leak into the submission.
  const userResult = await execute({ datasetId, queries });
  if (!userResult.ok) return userResult;
  const userTest = await getFinalResponse(userResult.data.response);
  if (!userTest.ok) return error500;
  await assertDatasetUnchanged();

  const response = reference.response;
  const testResponse = reference.testResponse;
  const userResponse = userResult.data.response.trim();
  const userTestResponse = currentTask.test ? userTest.data.response.trim() : null;
  const isCorrect = userTest.data.response.trim() === (testResponse ?? response);

  return await finalizeTask({
    userSolution: queries,
    correct: isCorrect,
    response,
    testResponse,
    userResponse,
    userTestResponse,
  });
}
