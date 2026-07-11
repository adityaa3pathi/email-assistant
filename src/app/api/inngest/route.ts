import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { initialSyncJob, historicalSyncJob } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    initialSyncJob,
    historicalSyncJob,
  ],
});
