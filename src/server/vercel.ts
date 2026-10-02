// Vercel serverless entry. vercel.json rewrites every /api/* request to api/index.js,
// which re-exports this handler. Static files are served by Vercel's CDN.
import { createRequestHandler } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createServices } from "./services.ts";

const config = loadConfig();
const { ai, game } = createServices(config);

export default createRequestHandler({ game, ai });
