import { Inngest } from "inngest";

// Single Inngest client for the autonomous patient-data pipeline.
export const inngest = new Inngest({ id: "chartbridge" });
