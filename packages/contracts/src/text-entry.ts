// Typing a few words into a field the game draws itself: a room's name, its
// password, a code. The game draws the field from `value` and `caret`; the
// host gets the keys. In a browser that is a hidden <input>
// (apps/web/src/ui/text-entry.ts), so a physical keyboard, a phone's or a
// tablet's own keyboard, input methods, paste and password managers all
// work; a host with a keyboard of its own (the Apple TV's, bridged as
// `globalThis.__native.keyboard`) can be one instead. The game polls it each
// frame, as it does a TableSocket.

/** What is being typed, for the keyboard to suit it: plain words, a password (masked, and offered to password managers), a room's code. */
export type TextKind = "name" | "password" | "new-password" | "code";

export type TextRequest = {
  /** Which field, in the screen's own words. */
  id: string;
  kind: TextKind;
  value: string;
  /** At most this many characters. */
  max: number;
};

export interface TextEntry {
  /** The field being typed into, or null. */
  readonly active: string | null;
  /** What it holds now, and where the caret is (characters in). */
  readonly value: string;
  readonly caret: number;
  /** How the typing ended, once, if it has since the last call: Return ("done"), Escape ("cancel"); then `active` is null. */
  take(): "done" | "cancel" | null;
  /** Starts typing into a field (or the next one, ending the last). */
  begin(request: TextRequest): void;
  /** Stops, keeping what was typed. */
  end(): void;
}
