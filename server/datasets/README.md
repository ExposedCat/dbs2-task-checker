# Runtime datasets

This directory is bind-mounted into the server container at `/app/datasets` (read-only).
Its contents are not tracked in git. The server expects:

```
datasets/
  redis/dataset.txt     # one Redis command per line; loaded into the student's Redis
                        # instance before every query (GET /dataset?datasetId=redis also serves it)
  mongodb/dataset.js    # mongosh script; run against the student's sandbox MongoDB
                        # database before every query
```
