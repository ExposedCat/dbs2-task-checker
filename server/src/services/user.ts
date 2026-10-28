import { stateChanges } from './state-comparison';
import { compareTaskResults } from './grading';
import { randomUUID } from 'node:crypto';
import { parseReplies } from './comparison';
import { hasPassed, validateTestPolicy } from './test-policy';
import { validateTask } from './task-validation';
import { isUserCreationPending } from './user-creation';
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
  minPoints?: number;
  passed?: boolean;
  session: TestSession['tasks'];
};

export type User = {
  user: string;
  port: number;
  testSession: TestSession | null;
  submissions: Submission[];
  admin: boolean;
  created?: boolean;
  creationError?: string;
};

export type TestSession = {
  id: string;
  minPoints: number;
  datasetId: DatasetName;
  tasks: {
    id: string;
    orderMatters?: boolean;
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
    return await database.users.findOne(
      { _id: new ObjectId(userId), created: { $ne: false } },
      { projection: { password: 0 } },
    );
  } catch {
    return null;
  }
}

/** Everything an admin may see about a user: infrastructure details and progress, never the password */
export type UserInfo = {
  user: string;
  admin: boolean;
  created: boolean;
  creationError: string | null;
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
      created: user.created !== false,
      creationError:
        user.created === false
          ? (user.creationError ??
            (isUserCreationPending(user.user)
              ? null
              : 'Creation interrupted. Add this login again with the same password to retry.'))
          : null,
      redis: { port: user.port || null },
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
  sessionId: string;
};

export type FinalTestResult = { result: number; wrong: string[]; passed: boolean; minPoints: number };
export type TestProgressResult = { result: null } | FinalTestResult;

export async function quitTestSession({
  database,
  user,
  force = false,
  sessionId,
}: QuitTestSessionArgs): Promise<ServiceResponse<TestProgressResult>> {
  const session = user.testSession;
  if (!session || session.id !== sessionId) {
    return { ok: false, error: 'Test session is stale or has ended', data: null };
  }
  if (!force && session.tasks.some(task => task.userSolution === null)) {
    return { ok: true, error: null, data: { result: null } };
  }
  const grade = session.tasks.reduce((score, task) => score + Number(task.correct), 0);
  const passed = grade >= session.minPoints;
  const result = await database.users.updateOne(
    { _id: user._id, 'testSession.id': sessionId, testSession: session },
    {
      $push: {
        submissions: {
          datasetId: session.datasetId,
          grade,
          passed,
          minPoints: session.minPoints,
          session: session.tasks,
        },
      },
      $set: { testSession: null },
    },
  );
  if (!result.modifiedCount) return { ok: false, data: null, error: 'Test session changed; refresh and retry' };
  return {
    ok: true,
    error: null,
    data: {
      result: grade,
      passed,
      minPoints: session.minPoints,
      // Quit may end a test early: never reveal questions that were not displayed.
      wrong: session.tasks
        .filter(
          (task, index) =>
            !task.correct &&
            (task.userSolution !== null || index === session.tasks.findIndex(item => item.userSolution === null)),
        )
        .map(task => task.question),
    },
  };
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
        sessionId: string;
        taskId: string;
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

  if (hasPassed(user.submissions, datasetId, minPoints)) {
    return {
      ok: false,
      error: 'Test for this dataset is already passed',
      data: null,
    };
  }

  const dataset = await database.datasets.findOne({ id: datasetId });
  if (!dataset) return { ok: false, data: null, error: 'Dataset not found' };
  const policyError = validateTestPolicy({ ...dataset, kinds: cathegories, minPoints });
  if (policyError) return { ok: false, data: null, error: policyError };
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

  if (minPoints > sessionBank.length) return { ok: false, data: null, error: 'Passing points are unreachable' };
  for (const task of sessionBank) {
    const error = validateTask(task);
    if (error) return { ok: false, data: null, error: `Invalid task: ${error}` };
  }
  const sessionId = randomUUID();
  const tasks = sessionBank.map<TestSession['tasks'][number]>(item => ({
    ...item,
    id: randomUUID(),
    userSolution: null,
    response: null,
    testResponse: null,
    userResponse: null,
    userTestResponse: null,
    correct: false,
  }));

  const started = await database.users.updateOne(
    { _id: user._id, testSession: null, submissions: user.submissions },
    {
      $set: {
        testSession: {
          id: sessionId,
          minPoints,
          datasetId,
          tasks,
        },
      },
    },
  );

  if (!started.modifiedCount) return { ok: false, data: null, error: 'Test session is already started' };

  return {
    ok: true,
    data: {
      sessionId,
      taskId: tasks[0].id,
      firstQuestion: tasks[0].question,
      response: `'${datasetId}' test session started`,
    },
    error: null,
  };
}

export type ExecuteQuestionArgs = BaseExecuteArgs & {
  database: Database;
  user: WithId<User>;
  sessionId: string;
  taskId: string;
};

export type ExecuteQuestionResult = ServiceResponse<TestProgressResult>;

export async function executeQuestion({
  database,
  user,
  queries,
  sessionId,
  taskId,
}: ExecuteQuestionArgs): Promise<ExecuteQuestionResult> {
  if (!user.testSession || user.testSession.id !== sessionId) {
    return { ok: false, error: 'Test session is stale or has ended', data: null };
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
  if (currentTask.id !== taskId) return { ok: false, data: null, error: 'Task is stale or has already been answered' };
  const taskError = validateTask(currentTask);
  if (taskError) return { ok: false, data: null, error: `Invalid task: ${taskError}` };

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
      {
        _id: user._id,
        'testSession.id': sessionId,
        [`testSession.tasks.${currentTaskIndex}.id`]: taskId,
        [`testSession.tasks.${currentTaskIndex}.userSolution`]: null,
      },
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

    if (!newUser) return { ok: false, data: null, error: 'Task is stale or has already been answered' };
    return quitTestSession({ database, user: newUser, sessionId });
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

  const getFinalResponse = async (data: { response: string; comparisonResponse?: string }): Promise<
    ServiceResponse<{ response: string; comparisonResponse?: string }>
  > => {
    if (!currentTask.test) {
      return { ok: true, data, error: null };
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
      executorVersion: `automatic-state-v4:${process.env.REFERENCE_CACHE_VERSION ?? 'executor-v1'}`,
      scope: 'shared-private-grading-v1',
    },
    async () => {
      const correctResult = await execute({
        datasetId,
        queries: currentTask.solution,
        captureState: !currentTask.test,
      });
      if (!correctResult.ok || correctResult.data.skipped) {
        throw new Error('Failed to execute reference solution. Please report to your teacher');
      }
      const correctTest = await getFinalResponse(correctResult.data);
      if (!correctTest.ok) throw new Error('Failed to verify reference solution. Please report to your teacher');
      if (!currentTask.test && !correctResult.data.state) throw new Error('Reference database state missing');
      if (currentTask.test || !Object.keys(stateChanges(correctResult.data.state!)).length)
        parseReplies(correctTest.data.response);
      await assertDatasetUnchanged();
      return {
        response: correctResult.data.response.trim(),
        ...(correctResult.data.state ? { state: correctResult.data.state } : {}),
        ...(correctResult.data.comparisonResponse === undefined
          ? {}
          : { comparisonResponse: correctResult.data.comparisonResponse }),
        ...(!currentTask.test || correctTest.data.comparisonResponse === undefined
          ? {}
          : { testComparisonResponse: correctTest.data.comparisonResponse }),
        testResponse: currentTask.test ? correctTest.data.response.trim() : null,
      };
    },
  );

  // Reference execution (on a miss) is complete before student code starts. This call
  // always resets/reloads, so reference mutations cannot leak into the submission.
  const userResult = await execute({ datasetId, queries, captureState: !currentTask.test });
  if (!userResult.ok) return userResult;
  const userTest = await getFinalResponse(userResult.data);
  if (!userTest.ok) return error500;
  await assertDatasetUnchanged();

  const response = reference.response;
  const testResponse = reference.testResponse;
  const userResponse = userResult.data.response.trim();
  const userTestResponse = currentTask.test ? userTest.data.response.trim() : null;
  const isCorrect = compareTaskResults(currentTask, reference, {
    response: userResponse,
    testResponse: userTestResponse,
    comparisonResponse: userResult.data.comparisonResponse,
    testComparisonResponse: currentTask.test ? userTest.data.comparisonResponse : undefined,
    state: userResult.data.state,
  });

  return await finalizeTask({
    userSolution: queries,
    correct: isCorrect,
    response,
    testResponse,
    userResponse,
    userTestResponse,
  });
}
