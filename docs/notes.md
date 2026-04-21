# Notes

Quick-reference decisions and trade-off discussions that don't fit cleanly in the learning log.

---

## Database Evolution — SQLite → Postgres

### Why we started with SQLite

The first persistence layer used Python's built-in `sqlite3` — zero new dependencies, zero infra, one file on disk. The query pattern was simple: fetch all jobs, fetch one job by `thread_id`. SQLite handles both in milliseconds and required no setup.

The store interface was abstracted from day one (`add_state`, `update_state`, `get_state`) so the orchestrator and routes had no knowledge of the backing implementation.

### Why we migrated to Postgres

The query patterns changed. Future scope includes:
- Filter jobs by status (`WHERE status = 'interview_scheduled'`)
- Filter jobs by tag (`WHERE tags @> ['fintech']`)
- Aggregate across rows (`GROUP BY status` for a pipeline view)

These queries require scanning and parsing the JSON blob on every row — no index can help. The fix: extract the fields you query on into real columns with proper indexes.

SQLite also has a single-writer lock — fine for one user, a bottleneck the moment you run two backend workers.

### What changed

`db.py` was the only file rewritten. The store interface (`sheet_store.py`, `profile_store.py`) didn't change. The orchestrator and routes didn't change. This is the payoff of the interface abstraction.

### SQL vs NoSQL — the honest framing

The instinct when storing JSON blobs is to reach for MongoDB. But the decision isn't about data shape — it's about **query patterns and guarantees**.

| | Postgres (current) | MongoDB | SQLite |
|---|---|---|---|
| Filter by status/tag | Indexed btree/GIN | Yes (indexes) | Full scan |
| ACID writes | Yes | Yes (since v4.0) | Yes |
| Array containment query | `@>` with GIN index | `$elemMatch` | No native support |
| Infra required | Yes (server) | Yes (server) | No |
| Declarative constraints | Yes | Limited | Yes |

MongoDB would also work here. Postgres wins because: the data has a known, stable core (company, role, status, tags) that maps naturally to columns; SQL aggregations are cleaner than MongoDB's aggregation pipeline; and one database is better than two.

**Note:** "SQL = ACID, NoSQL = no ACID" is outdated. MongoDB, DynamoDB, and Firestore all offer ACID transactions now. The real distinctions are query model, infra cost, and schema flexibility.

### The hybrid pattern

Keep `state_json` as a JSONB blob for agent outputs (they change with every feature). Extract only the fields you query on as real columns. This is what Postgres's `JSONB` type is designed for.

```
jobs table
─────────────────────────────────────────────────────
thread_id   TEXT PRIMARY KEY      btree — fetch by ID
status      TEXT  [btree index]   WHERE status = 'done'
tags        TEXT[] [GIN index]    WHERE tags @> ['fintech']
company     TEXT                  display only
role        TEXT                  display only
state_json  JSONB                 full agent output
updated_at  TIMESTAMPTZ           ORDER BY updated_at DESC
```

**Interview answer:** *"We started with SQLite — zero infra, zero dependencies, right for the initial query pattern. When future scope added status filtering and tag queries, we hit the wall: you can't index inside a JSON blob. We migrated to Postgres and pulled the query-relevant fields into real columns. The store interface meant that migration touched one file. The orchestrator never knew the database changed."*
