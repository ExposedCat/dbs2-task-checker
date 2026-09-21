import Elysia from 'elysia';
import { RequireAuth } from '../middlewares/auth';
import { getDatasets } from '../services/dataset';

export const SessionRoute = new Elysia({ name: 'Route.Session' })
  .use(RequireAuth)
  .get('/session', async ({ user, database }) => {
    // FIXME:
    const { data } = await getDatasets({ database });
    const availableTests = data
      .filter(
        dataset => !user.submissions.some(submission => submission.datasetId === dataset.id && submission.grade >= 10),
      )
      .map(dataset => dataset.id);
    const nextTaskIndex = user.testSession?.tasks.findIndex(task => !task.userSolution);
    const nextTask =
      nextTaskIndex === undefined || nextTaskIndex === -1 ? null : user.testSession!.tasks[nextTaskIndex];
    return {
      ok: true,
      data: {
        date: Date.now(),
        login: user.user,
        testSession: nextTask && {
          kind: nextTask.kind,
          datasetId: user.testSession!.datasetId,
          question: nextTask.question,
          questionNumber: nextTaskIndex! + 1,
          questionTotal: user.testSession!.tasks.length,
        },
        availableTests,
        admin: user.admin,
      },
      error: null,
    };
  });
