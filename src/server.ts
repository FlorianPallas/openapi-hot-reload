import WebSocket, { WebSocketServer } from "ws";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const wss = new WebSocketServer({
  port: 5000,
  perMessageDeflate: {
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3,
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024,
    },
    // Other options settable:
    clientNoContextTakeover: true, // Defaults to negotiated value.
    serverNoContextTakeover: true, // Defaults to negotiated value.
    serverMaxWindowBits: 10, // Defaults to negotiated value.
    // Below options specified as default values.
    concurrencyLimit: 10, // Limits zlib concurrency for perf.
    threshold: 1024, // Size (in bytes) below which messages
    // should not be compressed if context takeover is disabled.
  },
});

let schema: { data: Buffer; hash: string; hasChanged: boolean } | undefined;

const getSchema = async (force = false) => {
  if (!schema || force) {
    const data = await fs.readFile("openapi.yaml");
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    const hasChanged = schema?.hash !== hash;
    schema = { data, hash, hasChanged };
  }
  return schema;
};

const watcher = fs.watch("openapi.yaml");

wss.on("connection", async (ws) => {
  console.log("Client connected, sending schema...");
  const schema = await getSchema();
  ws.send(schema.data);

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

for await (const _ of watcher) {
  const schema = await getSchema(true);
  if (!schema.hasChanged) {
    continue;
  }

  console.log(`openapi.yaml changed, updating ${wss.clients.size} clients...`);
  wss.clients.forEach(async (client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(schema.data);
    }
  });
}
