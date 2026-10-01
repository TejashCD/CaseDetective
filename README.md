# CaseDetective

**Every clue is a concept. Explain it to earn it.**

CaseDetective is a detective game made from your own study material. You paste your notes, and the game turns them into a mystery set on a rainy night in Amsterdam. Three witnesses each guard one key concept from your material. You only get their evidence by explaining that concept in your own words. Collect all three clues, present your case at the police station, and the case is solved. By then, you have studied the material.

---

## Starting a case

On the title screen you have three ways to begin:

- **Your own material.** Paste notes, a chapter summary, or just a topic (up to 40,000 characters) and press **Open the case file**. Writing the case takes about 20 to 40 seconds.
- **A sample topic.** Click Photosynthesis, Causes of WWI, Newton's laws or Sorting algorithms to fill in example notes.
- **The demo case.** Press **Play the demo case** to start *The Case of the Vanished Tulips* right away. It covers supply and demand, price elasticity and externalities. The demo also works without an internet connection, with simpler grading.

Every case gets its own title, story, three witnesses, three concepts and a hidden solution, all based on your material.

## The briefing

When a case opens, you get a briefing with the story, the three witnesses (name, job, location and the concept each one guards) and the controls. You can open it again at any time with the **?** button, or by reading the **Case notice** board on the quay where you start.

## The street

You play a detective in a trench coat on a canal street at night: canal houses, rain, street lamps, bikes and boats on the water.

- **You start** on the quay, on the near side of the canal.
- **Two bridges** cross the canal to the street with the shops.
- **The three witnesses** stand outside their shops. Each shop has its own sign and awning in the witness's colour.
- **The Politiebureau** (police station) is at the far east end of the street.

### Moving around

| Control | What it does |
| --- | --- |
| `W` `A` `S` `D` or arrow keys | Walk |
| Click anywhere | Walk there. The detective finds the way across a bridge by itself. |
| Click a witness | Walk to them and start the conversation |
| `E`, `Enter` or `Space` | Talk, enter, or read, when the prompt at the bottom of the screen appears |
| Witness list in the case file | Click a name to walk straight to that witness |

On a phone or tablet, a direction pad and a **Talk** button appear on screen.

### Signs on the street

- **Amber `?`** above a witness means you haven't earned their clue yet.
- **Green check** means you have.
- **Name tags** appear when you walk close to someone.
- **Arrows at the edge of the screen** point toward witnesses you still need. Once you have all three clues, they point to the police station, and a **`!`** appears above its door.

## The case file

The panel next to the game is your case file. It shows:

- **The case title, story and objective.**
- **Evidence.** Three cards, one per concept. They start sealed. When you earn a clue, the card turns into a stamped piece of paper evidence with the clue text.
- **Suspicion.** A meter from 0 to 100, labelled Calm, Wary or Hostile.
- **Witnesses.** Each witness with their status: *Not seen*, *Questioned* or *Clue earned*.
- **Report to the Politiebureau.** This button unlocks once you have all three clues, and walks you to the station.

## Questioning a witness

Talking to a witness takes you inside their shop. The witness sits behind the desk and blinks, breathes, and moves their mouth while talking. You see the scene over the detective's shoulder. The case file changes into the conversation.

1. **The witness greets you and asks a question** about their concept. The question is marked with an amber line.
2. **You answer.** Type your own answer, or pick one of the three suggested replies.
3. **The witness judges your answer** and replies in character.

### How answers are judged

Witnesses judge whether you understand the concept, not whether you used the right words. Your own wording is fine.

| Your answer | What happens |
| --- | --- |
| **Correct** | The witness hands over the clue. You hear a chime, the evidence card is stamped *Logged*, and the clue appears on the desk. |
| **On the right track** | The witness nudges you toward what's missing. No suspicion. |
| **Wrong or careless** | Suspicion goes up by 5 to 15, and the witness explains the concept again from a new angle with an everyday example. |
| **A question or "I don't know"** | Never raises suspicion. Asking for a hint is always safe. |

Witnesses never give away the answer before you earn it.

### Suspicion

If suspicion reaches **100**, the witness throws you out of the shop. Suspicion then drops back to 60, and you can come back and try again.

### After you earn a clue

You can keep talking to the witness. They then act as a tutor. You can ask for a deeper explanation, how the concept connects to the case, or an exam-style practice question.

### Conversation controls

| Control | What it does |
| --- | --- |
| `Enter` | Send your answer |
| `Shift` + `Enter` | New line |
| `1` `2` `3` | Pick a suggested reply (when the text box is empty) |
| Click the conversation | Skip the typing animation |
| `Esc` or **Leave** | Go back to the street |

Each witness remembers your conversation. When you return, everything you said before is still there.

## Solving the case

With all three clues, go to the Politiebureau. Without all three, the desk sergeant sends you away and tells you who you still need to see.

Inside, you see your three pieces of evidence and the final question, for example: *"What destroyed the tulip trader? Explain it using all three concepts you uncovered."* Write your explanation and press **Present the case**.

The inspector gives one of three verdicts:

| Verdict | Meaning |
| --- | --- |
| **Case solved** | You used all three concepts correctly and linked them to the case. |
| **Not convinced** | Some parts are right, but concepts are missing or the links are weak. |
| **Rejected** | Mostly wrong. |

You always get feedback, plus a list of the concepts that were weak or missing. You can revise your explanation and present it again as often as you want.

## The case report

When the case is solved, or when you press **End & review** at any time, you get a case report:

- **A stamp** saying *Case closed* or *Case open*.
- **Your stats:** clues earned, answers given, accusations made, and final suspicion.
- **Each concept,** marked *Earned* or *Missed*, with its clue or the question you still need to answer.
- **The full solution** to the case.
- **The inspector's feedback** on your final explanation.
- **Review next:** a list of the points you got wrong along the way, as a personal study list.

From the report you can **resume the case** if it isn't solved yet, **print it as a study sheet**, or **open a new case**.

## Other features

- **Sound.** Rain in the background, a chime when you earn a clue, and a low thud when suspicion rises. Turn it on or off with the speaker button. The game remembers your choice.
- **Refresh-safe.** If you reload the page, you continue the same case with your conversations intact.
- **Phone and tablet.** On a touch screen you get on-screen controls, and the layout stacks the game above the case file.
- **Reduced motion.** If your device asks for less motion, animations and typing effects are switched off.

## Starting the game

You need Node.js 20.12 or newer and an Anthropic API key.

```bash
npm install
cp .env.example .env
npm start
```

Put your API key in `.env`, then open http://localhost:3000 in your browser.
