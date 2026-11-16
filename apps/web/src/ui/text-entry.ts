// Typing in a browser, and on the Apple TV (NativeTextEntry, below).
//
// In a browser: one <input>, never seen, focused while a field the
// game draws is being typed into, so that whatever the player types with
// works as it does anywhere on the web: a physical keyboard, a phone's or a
// tablet's own keyboard, an input method composing a word, paste, a password
// manager. The game draws the field itself, from the input's value and its
// caret. It is the one element on the page besides the canvas, and nothing
// of it shows: rule 5 (everything is drawn in engine) holds for what is seen.
//
// Its keys are its own: they stop at the input, so typing a space or an arrow
// doesn't also press the remote's buttons. Return finishes, Escape gives up
// (the field goes back to what it was); leaving the field (a tap elsewhere,
// the phone's keyboard closed) finishes too.

import type { NativeKeyboardBridge, TextEntry, TextKind, TextRequest } from "@fly/contracts";

const TYPE: Record<TextKind, string> = { name: "text", password: "password", "new-password": "password", code: "text" };
/** What a password manager is to make of it: nothing to fill or keep, a password to fill, or one to keep. */
const AUTOCOMPLETE: Record<TextKind, string> = { name: "off", password: "current-password", "new-password": "new-password", code: "off" };

export class BrowserTextEntry implements TextEntry {
  active: string | null = null;
  value = "";
  caret = 0;
  #ended: "done" | "cancel" | null = null;
  /** What the field held when typing began, to go back to on Escape. */
  #before = "";
  #input: HTMLInputElement | null = null;
  readonly #sync = () => {
    const input = this.#input;
    if (!input || !this.active) return;
    this.value = input.value;
    this.caret = input.selectionEnd ?? input.value.length;
  };

  #element(): HTMLInputElement {
    if (this.#input) return this.#input;
    const input = document.createElement("input");
    // Out of sight but focusable: some browsers won't focus what has no size, or is hidden. 16 px, or iOS zooms the page to it.
    input.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;font-size:16px;color:transparent;background:transparent;caret-color:transparent;pointer-events:none;";
    input.spellcheck = false;
    input.setAttribute("autocorrect", "off");
    input.setAttribute("enterkeyhint", "done");
    input.setAttribute("aria-label", "Text");
    const own = (e: Event) => e.stopPropagation();
    input.addEventListener("keydown", (e) => {
      own(e);
      if (e.isComposing) return;
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.#finish("done");
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.#finish("cancel");
      }
    });
    input.addEventListener("keyup", (e) => {
      own(e);
      this.#sync();
    });
    input.addEventListener("keypress", own);
    input.addEventListener("input", this.#sync);
    input.addEventListener("select", this.#sync);
    document.addEventListener("selectionchange", this.#sync);
    input.addEventListener("blur", () => this.#finish("done"));
    document.body.append(input);
    this.#input = input;
    return input;
  }

  begin(request: TextRequest) {
    const input = this.#element();
    this.active = null;
    input.type = TYPE[request.kind];
    input.autocomplete = AUTOCOMPLETE[request.kind] as AutoFill;
    input.autocapitalize = request.kind === "name" ? "sentences" : "none";
    input.name = request.id;
    input.maxLength = request.max;
    input.value = request.value;
    this.#before = request.value;
    this.value = request.value;
    this.caret = request.value.length;
    this.#ended = null;
    this.active = request.id;
    input.focus({ preventScroll: true });
    input.setSelectionRange(this.caret, this.caret);
  }

  end() {
    if (!this.active) return;
    this.#sync();
    this.active = null;
    this.#input?.blur();
  }

  #finish(how: "done" | "cancel") {
    if (!this.active) return;
    this.#sync();
    if (how === "cancel") this.value = this.#before;
    this.active = null;
    this.#ended = how;
    this.#input?.blur();
  }

  take() {
    const ended = this.#ended;
    this.#ended = null;
    return ended;
  }
}

/**
 * Typing on the Apple TV: tvOS's own keyboard screen (`__native.keyboard`),
 * which takes the whole field at once and gives back what was typed when the
 * player is done. Until then the field shows what it held.
 */
export class NativeTextEntry implements TextEntry {
  active: string | null = null;
  value = "";
  caret = 0;
  readonly #bridge: NativeKeyboardBridge;
  #ended: "done" | "cancel" | null = null;
  /** Each question's number: an answer to one since given up (another field, or `end`) is no one's. */
  #asked = 0;

  constructor(bridge: NativeKeyboardBridge) {
    this.#bridge = bridge;
  }

  begin(request: TextRequest) {
    const asked = ++this.#asked;
    this.active = request.id;
    this.value = request.value;
    this.caret = request.value.length;
    this.#ended = null;
    this.#bridge.ask(request.label ?? request.id, request.value, request.kind, (text) => {
      if (asked !== this.#asked) return;
      if (text !== null) this.value = text.slice(0, request.max);
      this.caret = this.value.length;
      this.active = null;
      this.#ended = text === null ? "cancel" : "done";
    });
  }

  end() {
    if (!this.active) return;
    this.#asked++;
    this.active = null;
    this.#bridge.close();
  }

  take() {
    const ended = this.#ended;
    this.#ended = null;
    return ended;
  }
}

/** The Apple TV host's keyboard, where there is one. */
export function nativeKeyboard(): NativeKeyboardBridge | null {
  return (globalThis as { __native?: { keyboard?: NativeKeyboardBridge } }).__native?.keyboard ?? null;
}
