import WebSocket from "ws";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

const outDir = "src/client";
const hashPath = path.join(outDir, "HASH");
const tempPath = "/tmp/openapi.yaml";

const socket = new WebSocket("ws://localhost:5000");

socket.onmessage = async (event) => {
  const data = event.data as Buffer;
  const hash = crypto.createHash("sha256").update(data).digest("hex");
  const oldHash = await fs
    .readFile(hashPath)
    .then((res) => res.toString())
    .catch(() => null);

  if (hash === oldHash) {
    console.log("No changes detected, skipping code generation.");
    return;
  }

  console.log("Changes detected, generating code...");

  const start = Date.now();

  await fs.writeFile(tempPath, data);

  const ps = spawn("openapi-generator", [
    "generate",
    "-i",
    tempPath,
    "-g",
    "typescript-fetch",
    "-o",
    outDir,
  ]);

  ps.stdout.on("data", (data) => process.stdout.write(data.toString()));
  ps.stderr.on("data", (data) => process.stderr.write(data.toString()));

  const status = await new Promise<number | Error | null>((resolve, reject) => {
    ps.on("close", resolve);
    ps.on("error", reject);
  });

  await fs.writeFile(hashPath, hash);

  const end = Date.now();

  console.log(`code: ${status} - sync took ${end - start}ms`);
};
