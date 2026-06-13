import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { patientPipeline } from "@/lib/inngest/functions";

// Inngest needs GET (sync/introspection), POST (run), and PUT (register).
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [patientPipeline],
});
