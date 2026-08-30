import "dotenv/config";
import { createApp } from "./app.js";
import { env } from "./lib/env.js";
import { startReconciliationCron } from "./lib/cron.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Hourly safety-net sweep — §8. Runs in the same process as the API,
// per the monorepo decision (§4/§12); promote to apps/worker only if
// sync volume ever grows enough to affect API responsiveness.
startReconciliationCron();
