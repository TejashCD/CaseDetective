# CaseDetective

A detective game built from your own study notes. Paste in a chapter, a summary or just a topic, and the game writes a mystery set on a rainy night in Amsterdam. Three witnesses each guard one key concept, and they only hand over their evidence once you explain that concept in your own words. Collect all three clues, make your case at the police station, and you've studied the material without noticing.

## How it plays

1. Start a case from your notes, pick a sample topic, or play the built-in demo (_The Case of the Vanished Tulips_, intro economics).
2. Walk the canal street and find the three witnesses. Each one asks you a question about their concept.
3. Answer in your own words. A correct answer earns the clue. A careless one raises suspicion, and at 100 the witness throws you out. Asking for a hint is always safe.
4. With all three clues, go to the Politiebureau and explain the case using all three concepts.
5. You get a report with the solution, what you got right, and a list of things to review.

| Control                      | Action                                  |
| ---------------------------- | --------------------------------------- |
| `W` `A` `S` `D` / arrow keys | Walk                                    |
| Click                        | Walk there (crosses bridges on its own) |
| `E` / `Enter` / `Space`      | Talk, enter, read                       |
| `1` `2` `3`                  | Pick a suggested reply                  |
| `Esc`                        | Leave a conversation                    |

It also works on touch screens, and the demo case runs offline with simpler keyword grading.

## Running it

Requires Node.js 22.18+ and an [Anthropic API key](https://console.anthropic.com/). Without a key only the demo case is playable.

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run build
npm start              # http://localhost:3000
```

For development, `npm run dev` recompiles the client and restarts the server on changes.

| Script              | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Watch mode for client and server             |
| `npm run build`     | Compile to `dist/`                           |
| `npm test`          | Run the tests (no network or API key needed) |
| `npm run typecheck` | Type-check everything                        |
| `npm run lint`      | ESLint with typescript-eslint's strict rules |
| `npm run check`     | Everything CI runs                           |

Optional settings in `.env`: `CASE_SECRET`, `MODEL_ID`, `TALK_EFFORT` (`low` to `max`) and `PORT`.

## Deploying to Vercel

The repo is set up for Vercel (`vercel.json`): the build output in `dist/web` is served as static files, and every `/api/*` request goes to one serverless function (`api/index.js`).

1. Import the repo in Vercel. The build settings come from `vercel.json`, so leave them on their defaults.
2. In **Settings > Environment Variables**, add `ANTHROPIC_API_KEY`. Optionally add `CASE_SECRET` (any long random string).
3. Redeploy. Environment variables only apply to deployments made after they are added.

Visit `/api/health` on your deployment: `"keyConfigured": true` means the key reached the server.

Any host that can run `npm start` (Render, Railway, Fly.io) works too.

## How it works

The browser never talks to the AI directly. The server holds the API key and the hidden parts of each case (the solution and what counts as a correct answer for each witness), grades every answer, and only sends the browser what the player is allowed to see. Those public shapes live in `src/shared/api.ts` and are used by both sides, so the client and server can't drift apart.

Every model call uses structured output with a Zod schema, so answers come back as typed objects instead of free text. If an answer comes back malformed it is retried once.

The street, characters and interiors are drawn on a canvas in code. There are no image or audio files; the rain and sound effects are synthesised with the Web Audio API.

```
src/
  shared/          API types and limits used by client and server
  server/
    main.ts        Standalone server entry point
    vercel.ts      Serverless entry point (re-exported by api/index.js)
    services.ts    Wires up the model client and game
    app.ts         Request handler shared by both entry points
    ai/            Model client, schemas, prompts
    game/          Rules, game engine, case tokens, demo case, offline grading
    http/          Routes, static files, error mapping
  client/
    main.ts        Entry point: builds and connects the UI
    ui/            Title screen, case file, interview, accusation, report
    world/         Canvas world: layout, pathfinding, characters, rendering
    game/          Client-side case state, saved per tab
    core/          API client, DOM and storage helpers
public/            HTML, CSS, favicon
api/               Vercel function
test/              node:test suites using a fake model client
```

A few decisions worth noting:

- The game engine gets its model client and store passed in, so it is tested without network access.
- The server keeps no state. Each case is encrypted (AES-256-GCM) into a token the browser holds and sends back with every request, so any serverless instance can continue any case and nothing needs a database. The hidden solution stays unreadable, and edited tokens are rejected.
- Pathfinding is plain functions with no DOM access, so it is unit tested in Node.
- No framework and no bundler. TypeScript compiles to ES modules the browser loads directly, and Node runs the tests straight from the `.ts` sources.

## License

MIT
