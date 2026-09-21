import { ObjectId } from 'mongodb';
import type { WithId } from 'mongodb';

import type { Database } from './database';
import type { Dataset } from './dataset';
import { execute } from './execute/index';
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
  password: string;
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

export type LoginUserArgs = {
  database: Database;
  login: string;
  password: string;
};

export async function loginUser(args: LoginUserArgs) {
  const { database, login, password } = args;

  const user = await database.users.findOne({ user: login });
  if (!user) {
    return null;
  }

  const passwordCorrect = password === user.password;
  if (!passwordCorrect) {
    return null;
  }

  return user._id.toString();
}

export type GetUserArgs = {
  database: Database;
  userId: string;
};

export async function getUser(args: GetUserArgs) {
  const { database, userId } = args;

  try {
    return await database.users.findOne({ _id: new ObjectId(userId) });
  } catch {
    return null;
  }
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
      user,
      noReset: true,
    });

    if (!result.ok) {
      console.error('Failed to get final response', result.error);
      return error500;
    }

    return result;
  };

  const userResult = await execute({ datasetId, queries, user });
  if (!userResult.ok) return userResult;

  if (userResult.data?.skipped) {
    return await finalizeTask({
      userSolution: normalizedQueries,
      correct: false,
      response: null,
      testResponse: null,
      userResponse: null,
      userTestResponse: null,
    });
  }
  const userTest = await getFinalResponse(userResult.data.response);
  if (!userTest.ok) {
    return error500;
  }

  const correctResult = await execute({
    datasetId,
    queries: currentTask.solution,
    user,
  });
  if (!correctResult.ok) {
    console.error('Failed to execute test query', correctResult.error);
    return error500;
  }
  const correctTest = await getFinalResponse(correctResult.data.response);
  if (!correctTest.ok) {
    console.error('Failed to execute test', correctTest.error);
    return error500;
  }

  const isCorrect = userTest.data.response.trim() === correctTest.data.response.trim();
  const userResponse = userResult.data.response.trim();
  const userTestResponse = currentTask.test ? userTest.data.response.trim() : null;
  const response = correctResult.data.response.trim();
  const testResponse = currentTask.test ? correctTest.data.response.trim() : null;

  return await finalizeTask({
    userSolution: queries,
    correct: isCorrect,
    response,
    testResponse,
    userResponse,
    userTestResponse,
  });
}
