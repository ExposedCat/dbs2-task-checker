import { Elysia } from 'elysia';

import { RequireBase } from './middlewares/base.js';
import { RequireErrorFallback } from './middlewares/fallback.js';
import { DatasetKindsRoute } from './routes/dataset-kinds.get.js';
import { SetDatasetKindsRoute } from './routes/dataset-kinds.post.js';
import { DatasetRoute } from './routes/dataset.get.js';
import { UploadDatasetRoute } from './routes/dataset.post.js';
import { DatasetsRoute } from './routes/datasets.get.js';
import { DeleteDatasetRoute } from './routes/delete-dataset.post.js';
import { LoginRoute } from './routes/login.post.js';
import { QueryRoute } from './routes/query.post.js';
import { SessionRoute } from './routes/session.get.js';
import { QuitTestSessionRoute, TestSessionRoute } from './routes/test-session.post.js';

const app = new Elysia()
  .use(RequireBase)
  // Public
  .use(LoginRoute)
  .use(DatasetRoute)
  // Private
  .use(UploadDatasetRoute)
  .use(SessionRoute)
  .use(DatasetsRoute)
  .use(TestSessionRoute)
  .use(QuitTestSessionRoute)
  .use(QueryRoute)
  .use(DatasetKindsRoute)
  .use(SetDatasetKindsRoute)
  .use(RequireErrorFallback)
  .use(DeleteDatasetRoute)
  .listen(8080);

console.log(`🦊 DBS Portal API is running at http://${app.server?.hostname}:${app.server?.port}`);
