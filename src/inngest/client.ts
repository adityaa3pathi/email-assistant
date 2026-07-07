import { Inngest } from "inngest";

if (process.env.NODE_ENV === "development") {
  process.env.INNGEST_DEV = "1";
}

// Create a client to send and receive events
export const inngest = new Inngest({ id: "email-assistant" });
