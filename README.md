# CaseDetective

**Every clue is a concept. Explain it to earn it.**

CaseDetective turns your own study notes into a detective game. Paste your notes or name a topic, and the game writes a case set on a rainy night in Amsterdam. Three witnesses each guard one core concept from your material. Walk the canals, question them, and earn their evidence by explaining each concept in your own words. Then report to the Politiebureau and tie all three concepts together to close the case.

Solving the case means you studied the material.

## How to play

1. **Open a case.** Paste notes, pick a sample topic, or play the demo case about economics.
2. **Walk the street.** Move with `WASD` or the arrow keys, or click anywhere to walk there. Use the bridges to cross the canal.
3. **Question the witnesses.** Walk up to someone marked with `?` and press `E`. Each witness asks you a question about their concept.
4. **Earn the evidence.** Witnesses judge whether you really understand, not whether you used the right words. Close answers get a nudge. Careless answers raise suspicion, and at 100 the witness throws you out.
5. **Make your case.** With all three clues, go to the Politiebureau at the end of the street and answer the final question.
6. **Read your report.** See which concepts you earned, the full solution, and what to review next. You can print it as a study sheet.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D`, arrows, or click | Walk |
| `E`, `Enter`, or `Space` | Talk or enter |
| `Esc` | Leave a conversation |
| `1` `2` `3` | Pick a suggested reply |

## Run it

You need Node.js 20.12 or newer and an Anthropic API key.

```bash
npm install
cp .env.example .env
npm start
```

Put your API key in `.env`, then open http://localhost:3000. The demo case also plays offline with simpler grading.

## Project structure

```
server.js         Game server and case logic
demo-case.js      The built-in demo case
public/
  index.html      Screens and dialogs
  styles.css      Visual design
  app.js          Game flow, conversations, accusation and report
  world.js        The canal street and interview room, drawn on a canvas
  audio.js        Rain and sound effects
```

Answers and solutions stay on the server, so they can't be read from the browser.
