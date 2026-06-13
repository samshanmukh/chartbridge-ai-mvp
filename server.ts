// Custom Next.js server that adds a WebSocket bridge on /api/grok-phone-call/bridge
// This is required because Next.js App Router route handlers do not support
// raw WebSocket upgrades — we intercept the upgrade event here.

import { createServer } from "http"
import { parse } from "url"
import next from "next"
import { WebSocketServer } from "ws"
import { handleBridgeSocket } from "./app/api/grok-phone-call/bridge/route"

const dev  = process.env.NODE_ENV !== "production"
const port = parseInt(process.env.PORT ?? "3000", 10)
const app  = next({ dev })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "/", true)
    handle(req, res, parsedUrl)
  })

  // WebSocket server — handles Twilio media stream bridge
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    const { pathname, query } = parse(req.url ?? "/", true)

    if (pathname === "/api/grok-phone-call/bridge") {
      wss.handleUpgrade(req, socket as import("net").Socket, head, (ws) => {
        const question  = (Array.isArray(query.question) ? query.question[0] : query.question) ?? "How are you feeling?"
        const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${port}`
        handleBridgeSocket(ws, question, appUrl).catch((err) => {
          console.error("[v0] Bridge error:", err)
          ws.close()
        })
      })
    } else {
      socket.destroy()
    }
  })

  server.listen(port, () => {
    console.log(`[v0] ChartBridge server ready on http://localhost:${port}`)
  })
})
