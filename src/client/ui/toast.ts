export type ToastKind = "" | "good" | "bad" | "gold";
export type Toast = (text: string, kind?: ToastKind, seconds?: number) => void;

const MAX_VISIBLE = 3;
const FADE_MS = 600;

export function createToaster(container: HTMLElement): Toast {
  return (text, kind = "", seconds = 4) => {
    const element = document.createElement("div");
    element.className = `toast ${kind}`.trim();
    element.textContent = text;
    element.style.setProperty("--life", `${seconds}s`);
    container.append(element);
    while (container.children.length > MAX_VISIBLE) container.firstElementChild?.remove();
    setTimeout(() => element.remove(), seconds * 1000 + FADE_MS);
  };
}
