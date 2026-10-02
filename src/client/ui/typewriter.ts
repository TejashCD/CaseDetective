// Reveals witness speech a few characters at a time.
import { prefersReducedMotion } from "../core/dom.ts";

const CHARS_PER_STEP = 2;
const STEP_MS = 16;
const PAUSE_BETWEEN_BUBBLES_MS = 260;
const TICK_EVERY_CHARS = 12;

interface TypewriterHooks {
  /** Starts/stops the witness's mouth animation. */
  onSpeaking: (speaking: boolean) => void;
  onTick: () => void;
  /** After each step, e.g. to keep the log scrolled down. */
  onProgress: () => void;
}

export class Typewriter {
  readonly #hooks: TypewriterHooks;
  #finishActive: (() => void) | null = null;

  constructor(hooks: TypewriterHooks) {
    this.#hooks = hooks;
  }

  /** Types out the current text of each element, in order. */
  play(bubbles: HTMLElement[]): void {
    this.finish();
    if (prefersReducedMotion() || bubbles.length === 0) return;

    const texts = bubbles.map((b) => b.textContent);
    for (const bubble of bubbles) bubble.textContent = "";
    const { onSpeaking, onTick, onProgress } = this.#hooks;
    let bubbleIndex = 0;
    let charIndex = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      clearTimeout(timer);
      bubbles.forEach((b, i) => (b.textContent = texts[i] ?? ""));
      onSpeaking(false);
      this.#finishActive = null;
      onProgress();
    };

    const step = () => {
      const bubble = bubbles[bubbleIndex];
      const text = texts[bubbleIndex];
      if (!bubble || text === undefined) {
        finish();
        return;
      }
      charIndex = Math.min(text.length, charIndex + CHARS_PER_STEP);
      bubble.textContent = text.slice(0, charIndex);
      if (charIndex % TICK_EVERY_CHARS === 0) onTick();
      onProgress();
      if (charIndex >= text.length) {
        bubbleIndex++;
        charIndex = 0;
        timer = setTimeout(step, PAUSE_BETWEEN_BUBBLES_MS);
      } else {
        timer = setTimeout(step, STEP_MS);
      }
    };

    this.#finishActive = finish;
    onSpeaking(true);
    step();
  }

  /** Skips to the end of the current animation. */
  finish(): void {
    this.#finishActive?.();
  }
}
