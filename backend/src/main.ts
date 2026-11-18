import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDb, disconnectDb } from './core/db/connection.js';
import { startJobs } from './jobs/purge-deleted.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp(env);
  await connectDb(env.MONGO_URI);
  const stopJobs = startJobs(app.log);

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    stopJobs();
    await app.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
