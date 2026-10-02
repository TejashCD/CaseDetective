import type { AddressInfo } from "node:net";
import { createModelClient } from "./ai/model-client.ts";
import { createApp } from "./app.ts";
import { loadConfig, loadEnvFile, STATIC_DIRS } from "./config.ts";
import { CaseStore } from "./game/case-store.ts";
import { Game } from "./game/engine.ts";

loadEnvFile();
const config = loadConfig();

const ai = createModelClient({ apiKey: config.apiKey, model: config.model });
const game = new Game({ ai, store: new CaseStore(), talkEffort: config.talkEffort });
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
