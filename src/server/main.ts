// Standalone server for local development and any host that runs a Node process.
import type { AddressInfo } from "node:net";
import { createApp } from "./app.ts";
import { loadConfig, loadEnvFile, STATIC_DIRS } from "./config.ts";
import { createServices } from "./services.ts";

loadEnvFile();
const config = loadConfig();
const { ai, game } = createServices(config);
const server = createApp({ game, ai, staticDirs: STATIC_DIRS });

server.listen(config.port, () => {
  const { port } = server.address() as AddressInfo;
  console.log(`CaseDetective running at http://localhost:${port}`);
  console.log(`Model: ${config.model} | API key ${ai.configured ? "loaded" : "missing (demo case runs offline)"}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
