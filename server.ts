// Simple custom server — wraps Next.js for local dev.
// The Twilio phone call flow now uses pure serverless routes (no WebSocket bridge needed).

import { createServer } from "http"
import { parse } from "url"
import next from "next"

const dev  = process.env.NODE_ENV !== "production"
const port = parseInt(process.env.PORT ?? "3000", 10)
const app  = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true)
    handle(req, res, parsedUrl)
  }).listen(port, () => {
    console.log(`[v0] ChartBridge ready on http://localhost:${port}`)
  })
})
