import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

// Only ever imported (dynamically) once POSTGRES_URL is confirmed set — see
// lib/video/job-store.ts. `max: 1` keeps this friendly to serverless
// (Vercel) invocations; the worker is a single long-running process so one
// pooled connection is enough there too.
const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("POSTGRES_URL is not set.");
}

// `prepare: false` is required against Neon's pooled connection string
// (PgBouncer in transaction-pooling mode, which doesn't support prepared
// statements — without this, queries can hang or fail unpredictably in a
// serverless environment where connections churn constantly).
// `connect_timeout` makes a dead/unreachable database fail fast with a
// clear error instead of hanging the whole request.
const client = postgres(connectionString, { max: 1, prepare: false, connect_timeout: 10 });
export const db = drizzle(client, { schema });
