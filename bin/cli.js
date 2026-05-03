#!/usr/bin/env node
import { createServer } from "../src/server.js";

const args = process.argv.slice(2);
const cmd = args[0];

function usage() {
  console.log(`feedback-to-cli — companion server for the feedback overlay

Usage:
  feedback-to-cli serve [--port <n>]    start the companion (default port 9091)
  feedback-to-cli --help                show this message

Pins from the overlay land in ./.feedback-to-cli/<page-slug>.md so your AI
assistant can read them directly. Run from the directory you want pins written to.
`);
}

if (!cmd || cmd === "--help" || cmd === "-h") {
  usage();
  process.exit(0);
}

if (cmd !== "serve") {
  console.error(`Unknown command: ${cmd}\n`);
  usage();
  process.exit(1);
}

const portIdx = args.indexOf("--port");
const port = portIdx !== -1 ? Number(args[portIdx + 1]) : 9091;
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${args[portIdx + 1]}`);
  process.exit(1);
}

const server = createServer(process.cwd());
server.listen(port, "127.0.0.1", () => {
  console.log(`feedback-to-cli listening on http://127.0.0.1:${port}`);
  console.log(`writing pins to ${process.cwd()}/.feedback-to-cli/`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is in use. Try --port 9092.`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
