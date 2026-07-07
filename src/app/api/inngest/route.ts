import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { initialSyncJob, syncEmailsJob } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    initialSyncJob,
    syncEmailsJob,
  ],
});
