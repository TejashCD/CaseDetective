// Vercel function. All /api/* requests are rewritten here by vercel.json.
// The handler is compiled from src/server/vercel.ts during `npm run build`.
export { default } from "../dist/server/vercel.js";
