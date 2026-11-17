// Playing with others online: rooms of up to eight people's flies
// (docs/online.md). Few words, one pane, four faces:
//
// - the rooms: a new one, a code to type, and every listed room with someone
//   in it, by its name, its place's colour, its flies as pips and a padlock
//   if it has a password, the rooms open to everyone first, each with a
//   globe; the list follows the room server as it changes;
// - a new room: its name (one is suggested), its place, whether it is listed
//   or only reached by its link, and a password if it is to have one;
// - a locked room's door: its password;
// - at a room: its name, a button to hand its link on (where there is a way
//   to: not on the Apple TV), one to leave, and for whoever started it each
//   other fly by its player's colour, to take it off; beside them, the room's
//   QR code for a phone to scan and its code to type. Who is there shows in
//   the world itself, a dab of each player's colour on their fly. In a room
//   open to everyone (where a device is by default), also the rooms, to go
//   to another from: the list, with this room still about the fly until
//   another is chosen.
//
// What goes wrong is said in the heading's place, briefly, in pink.

import type { RemoteButton } from "@fly/contracts";
import { CODE_LENGTH, MAX_FLIES, PASSWORD_MAX, ROOM_NAME_MAX, isTableCode, roomName } from "@fly/net";
import { Menu, choiceValue, indexOf } from "@fly/ui";
import type { ChoiceItem, FieldItem, HitMap, MenuItem, Option } from "@fly/ui";
import type { Frame } from "../../display.ts";
import type { Ended } from "../../online/online.ts";
import { suggestName } from "../../online/invite.ts";
import { PLACES, isPlaceId, placeInfo } from "../../places/catalog.ts";
import type { PlaceId } from "../../places/catalog.ts";
import { fitMenu, menuSpace, roomLayout } from "../layout.ts";
import type { MenuPanelSpec, RoomLayout } from "../layout.ts";
import { RoomCard } from "../room-card.ts";
import { MenuScreen } from "./menu-screen.ts";
import type { NewRoom, Point, Screen, Shell, TableNow } from "./types.ts";

/** Seconds "Link copied" shows before the button says what it does again. */
const COPIED_FOR = 2.5;
/** What goes wrong is said in this. */
const NOTE_COLOUR = "#d93c8e";
/** At most this many rows show at once; the rest scroll. */
const MOST_ROWS = 7;

export type OnlineView = "rooms" | "new" | "door" | "room";

/** What went wrong, as the heading says it instead of its name. */
const NOTES: Partial<Record<Ended | "wrong" | "name" | "code", string>> = {
  version: "Update needed",
  wrong: "Wrong password",
  busy: "Too many tries. Wait a minute",
  full: "That room is full",
  unknown: "That room has closed",
  removed: "You were taken off that room",
  name: "Letters and numbers only",
  code: "Not a room's code",
};

const LISTED: Option<boolean>[] = [
  { value: true, label: "Public" },
  { value: false, label: "Unlisted" },
];
const WHERE: Option<PlaceId>[] = PLACES.map((p) => ({ value: p.id, label: p.name }));

const colourOf = (place: string) => (isPlaceId(place) ? placeInfo(place).colour : "#ffffff");

export class OnlineScreen implements Screen {
  readonly id = "online";
  readonly #shell: Shell;
  #screen: MenuScreen;
  view: OnlineView = "rooms";
  /** What the rows were made from, to tell when they need making again. */
  #shape = "";
  /** The new room as it is being made, the code being typed, and the door's password. */
  readonly #draft: NewRoom = { name: "", listed: true, password: "", place: "picnic" };
  #code = "";
  #codeValid = false;
  #password = "";
  /** A note of this device's own (a name or a code that can't be one), shown until the next thing done. */
  #note: keyof typeof NOTES | null = null;
  /** The end of the last room, as last seen: a new one is noted. */
  #ended: Ended | null = null;
  /** The door last come to (Knock's seq). */
  #knocked = -1;
  /** In a room open to everyone, looking at the other rooms (or making one, or at a door) without having left it. */
  #looking = false;
  #copied = -1;
  #time = 0;
  readonly #occupants = new WeakMap<object, number>();
  #occupantSequence = 0;
  /** At a room: where its card is, and the card. */
  #room: RoomLayout | null = null;
  readonly #card = new RoomCard();

  constructor(shell: Shell) {
    this.#shell = shell;
    this.#screen = this.#build();
  }

  get menu() {
    return this.#screen.menu;
  }

  get heading() { return this.#heading(); }
  get semanticFocus() { return this.#screen.semanticFocus; }
  focus(id: string) { this.#screen.focus(id); }

  access(id: string, value?: number) { this.#screen.access(id, value); }

  /** A host text control edits the same draft as the canvas keyboard. */
  editValue(id: string, value: string) {
    const item = this.menu.item(id);
    if (item?.kind !== "field" || item.disabled) return;
    const max = id === "code" ? CODE_LENGTH : id === "name" ? ROOM_NAME_MAX : PASSWORD_MAX;
    this.#note = null;
    item.value = [...value].slice(0, max).join("");
    this.#store(id, item.value);
    this.#shell.menuChanged?.();
  }

  submitField(id: string) {
    this.#note = null;
    if (id === "code" && this.#code) {
      const code = this.#code.trim().toLowerCase();
      if (isTableCode(code)) this.#shell.joinRoom(code);
      else { this.#note = "code"; this.#refresh("code"); }
    } else if (id === "password" && this.view === "door") this.#knock();
  }

  /** What is said in place of the heading, if anything. */
  get note(): string {
    return this.#note ?? "";
  }

  /** The view this moment: at a room once there is one (on the door's face until it opens), otherwise the one chosen. */
  #reconcile() {
    const shell = this.#shell;
    const table = shell.table;
    const knock = shell.knock;
    if (knock && knock.seq !== this.#knocked) {
      // At a locked door: its password, and why again, if one was tried.
      this.#knocked = knock.seq;
      this.#password = "";
      this.#note = knock.wrong ? "wrong" : null;
      this.view = "door";
    }
    if (shell.tableEnded !== this.#ended) {
      this.#ended = shell.tableEnded;
      const note = this.#ended && this.#ended !== "locked" && this.#ended !== "left" ? this.#ended : null;
      if (note && note in NOTES) this.#note = note;
    }
    if (this.#note === "version" && shell.lobbyStatus === "open") this.#note = null;
    if (!table?.everyone) this.#looking = false;
    if (table && !this.#looking && (table.joined || this.view !== "door")) this.view = "room";
    else if (!table && this.view === "room") this.view = knock ? "door" : "rooms";
    if (this.view === "door" && !knock && !table) this.view = "rooms";
  }

  #incompatible() {
    const shell = this.#shell;
    return shell.lobbyStatus === "version" || (shell.tableEnded === "version" && shell.lobbyStatus !== "open");
  }

  /** The rows for the view as it is now. */
  #rows(): MenuItem[] {
    const shell = this.#shell;
    switch (this.view) {
      case "rooms": {
        const rows: MenuItem[] = [
          { kind: "action", id: "new", label: "New room", disabled: !shell.canPlayOnline || this.#incompatible() },
          { kind: "field", id: "code", label: "Code", value: this.#code, disabled: !shell.typing || this.#incompatible(), submit: { label: "Join", disabled: !this.#codeValid } },
        ];
        const rooms = shell.rooms;
        const status = shell.lobbyStatus;
        const unavailable = status === "lost" || status === "stale" || this.#incompatible();
        if (unavailable) {
          if (!this.#incompatible()) rows.push({ kind: "action", id: "unavailable", label: status === "stale" ? "Reconnecting…" : "Can't reach rooms", disabled: true });
        }
        else if (!rooms) rows.push({ kind: "action", id: "looking", label: "Looking for rooms…", disabled: true });
        else if (!rooms.length) rows.push({ kind: "action", id: "none", label: "No rooms open", disabled: true });
        for (const r of rooms ?? []) {
          // A full room open to everyone sends whoever chooses it on to the next.
          const everyone = r.everyone === true;
          rows.push({ kind: "action", id: `room:${r.code}`, label: r.name, hint: isPlaceId(r.place) ? placeInfo(r.place).name : undefined, swatch: colourOf(r.place), description: isPlaceId(r.place) ? placeInfo(r.place).name : r.place, count: [r.flies, MAX_FLIES], countLabel: `${r.flies}/${MAX_FLIES}`, locked: r.locked, everyone, disabled: unavailable || (r.flies >= MAX_FLIES && !everyone) });
        }
        return rows;
      }
      case "new": {
        const d = this.#draft;
        const place: ChoiceItem<PlaceId> = { kind: "choice", id: "place", label: "Place", options: WHERE, index: indexOf(WHERE, d.place) };
        const listed: ChoiceItem<boolean> = { kind: "choice", id: "listed", label: "Listing", options: LISTED, index: indexOf(LISTED, d.listed) };
        return [
          { kind: "field", id: "name", label: "Name", value: d.name, disabled: !shell.typing },
          place,
          listed,
          { kind: "field", id: "password", label: "Password", value: d.password, placeholder: "None", secret: true, disabled: !shell.typing },
          { kind: "action", id: "create", label: "Create", disabled: this.#incompatible() },
        ];
      }
      case "door": {
        // On the way into this room: not merely still in a room open to everyone, looking at others.
        const joining = !!shell.table && shell.table.code === shell.knock?.code;
        return [
          { kind: "field", id: "password", label: "Password", value: this.#password, secret: true, disabled: !shell.typing || joining },
          { kind: "action", id: "join", label: joining ? "Joining…" : "Join", disabled: joining || !this.#password || this.#incompatible() },
        ];
      }
      case "room": {
        const table = shell.table;
        if (!table) return [];
        const copied = this.#copied >= 0 && this.#time - this.#copied < COPIED_FOR;
        const rows: MenuItem[] = shell.canShare ? [{ kind: "action", id: "share", label: copied ? "Link copied" : "Share the link", disabled: !table.joined }] : [];
        if (table.starting) for (const o of table.others) rows.push({ kind: "action", id: this.#removalId(o), label: "Remove", description: `Player ${o.id}, ${o.colours.length} ${o.colours.length === 1 ? "fly" : "flies"}`, swatch: o.colours });
        if (table.everyone) rows.push({ kind: "action", id: "rooms", label: "Other rooms" });
        rows.push({ kind: "action", id: "leave", label: "Leave the room" });
        return rows;
      }
    }
  }

  #heading() {
    const shell = this.#shell;
    if (this.#incompatible()) return "Update needed";
    if (this.#note) return NOTES[this.#note] ?? "";
    if (this.view === "new") return "New room";
    if (this.view === "door") return shell.knock?.name ?? "Online";
    if (this.view === "room") return shell.table?.name ?? "Online";
    return "Online";
  }

  /** A device's player id can be another device's between frames (one left and another sat down there): the one before's removal must expire. */
  #removalId(other: TableNow["others"][number]) {
    let sequence = this.#occupants.get(other);
    if (sequence === undefined) this.#occupants.set(other, sequence = ++this.#occupantSequence);
    return `remove:${other.id}:${sequence}`;
  }

  #key() {
    const shell = this.#shell;
    const table = shell.table;
    const copied = this.#copied >= 0 && this.#time - this.#copied < COPIED_FOR;
    const rooms = shell.rooms ? shell.rooms.map((r) => `${r.code}:${r.name}:${r.place}:${r.flies}:${r.locked}`).join(",") : "?";
    const at = table ? `${table.name}|${shell.here}|${table.joined}|${table.starting}|${table.everyone}|${this.#looking}|${copied}|${table.others.map((o) => `${this.#removalId(o)}/${o.colours.length}`).join(",")}` : "alone";
    return `${this.view}|${this.#note}|${this.#codeValid}|${at}|${this.view === "rooms" ? rooms : ""}|${!!this.#password}|${shell.knock?.name}|${shell.canPlayOnline}|${shell.lobbyStatus}`;
  }

  #build(focus?: string) {
    const shell = this.#shell;
    const items = this.#rows();
    this.#shape = this.#key();
    const menu = new Menu(items, { focus });
    const note = !!this.#note;
    const values = this.view === "new" || this.view === "door" || this.view === "rooms";
    const spec: MenuPanelSpec = { items: items.length, maxRows: MOST_ROWS, width: 460, row: 40, heading: true, foot: 34, values, raise: 12 };
    // Its card once the room has let this device in.
    const card = this.view === "room" && !!shell.table?.joined;
    return new MenuScreen(shell, {
      id: "online",
      menu,
      heading: this.#heading(),
      headingColor: note ? NOTE_COLOUR : undefined,
      place: (frame) => {
        this.#room = card ? roomLayout(frame, spec) : null;
        return this.#room?.menu ?? fitMenu(menuSpace(frame), spec);
      },
      backdrop: (g) => {
        const table = shell.table;
        if (this.#room && table) this.#card.draw(g, shell.shape, this.#room, table);
      },
      onActivate: (item) => this.#activate(item.id),
      onChange: (item) => {
        this.#note = null;
        if (item.id === "place") this.#draft.place = choiceValue(item as ChoiceItem<PlaceId>);
        else if (item.id === "listed") this.#draft.listed = choiceValue(item as ChoiceItem<boolean>);
      },
      onEdit: (item) => this.#type(item),
      onSubmit: (item) => {
        if (item.id === "code") {
          shell.typing?.end();
          this.#joinCode();
        }
      },
      onBack: () => this.#back(),
    });
  }

  #activate(id: string) {
    const shell = this.#shell;
    this.#note = null;
    if (id === "new") {
      this.#draft.name = suggestName();
      this.#draft.password = "";
      this.#draft.listed = true;
      this.#draft.place = shell.here;
      this.#show("new", "create");
    } else if (id === "rooms") {
      this.#looking = true;
      this.#show("rooms", "new");
    } else if (id.startsWith("room:")) {
      const code = id.slice(5);
      const room = shell.rooms?.find((r) => r.code === code);
      if (!room) return;
      // The room the fly is in already: back to it.
      if (code === shell.table?.code) {
        this.#looking = false;
        this.#show("room");
        return;
      }
      // A locked one's door first: its password, then in.
      if (room.locked) shell.door({ code, name: room.name });
      else shell.joinRoom(code);
    } else if (id === "create") {
      const name = roomName(this.#draft.name);
      if (!name) {
        this.#note = "name";
        this.#refresh("name");
        return;
      }
      shell.startRoom({ ...this.#draft, name });
      this.#refresh();
    } else if (id === "join") this.#knock();
    else if (id === "share") {
      void shell.shareTable().then((how) => {
        if (how === "copied") this.#copied = this.#time;
        this.#refresh("share");
      });
    } else if (id === "leave") {
      shell.leaveTable();
      this.view = "rooms";
      this.#refresh("new");
    } else if (id.startsWith("remove:")) {
      const other = shell.table?.others.find((o) => this.#removalId(o) === id);
      if (other) shell.removeFly(other.id);
    }
  }

  /** Into the locked room with the password typed. */
  #knock() {
    const knock = this.#shell.knock;
    if (!knock || !this.#password) return;
    this.#shell.joinRoom(knock.code, this.#password);
    this.#refresh();
  }

  /** Starts typing into a field. */
  #type(item: FieldItem) {
    const typing = this.#shell.typing;
    if (!typing || item.disabled || typing.active === item.id) return;
    this.#note = null;
    const max = item.id === "code" ? CODE_LENGTH : item.id === "name" ? ROOM_NAME_MAX : PASSWORD_MAX;
    const kind = item.id === "code" ? "code" : item.id === "name" ? "name" : this.view === "new" ? "new-password" : "password";
    typing.begin({ id: item.id, kind, value: item.value, max, label: item.label });
  }

  typeNow(index: number, id: string) {
    const item = this.menu.items[index];
    if (item?.kind === "field" && item.id === id) this.#type(item);
  }

  #back() {
    const shell = this.#shell;
    shell.typing?.end();
    this.#note = null;
    if (this.view === "door") shell.door(null);
    if (this.view === "new" || this.view === "door") {
      this.view = "rooms";
      this.#refresh("new");
      return;
    }
    // Looking from a room open to everyone: back to it.
    if (this.#looking) {
      this.#looking = false;
      this.#show("room");
      return;
    }
    shell.back();
  }

  /** Shows another view, its focus on `focus`. */
  #show(view: OnlineView, focus?: string) {
    this.#shell.typing?.end();
    this.view = view;
    this.#refresh(focus);
  }

  /** The rows again, keeping the focus where it was (or on `focus`). */
  #refresh(focus?: string) {
    const was = this.#screen.menu.focused?.id;
    const semantic = this.#screen.semanticFocus;
    this.#screen = this.#build(focus ?? was);
    this.#screen.enter();
    if (semantic) this.#screen.focus(this.menu.focused?.id ?? "");
    this.#shell.menuChanged?.();
  }

  enter() {
    this.#reconcile();
    this.#refresh(this.view === "door" ? "password" : undefined);
    this.#atDoor();
  }

  /** At a door with buttons in hand (no finger to tap the field with), the password is typed at once. */
  #atDoor() {
    const field = this.menu.items[0];
    if (this.view === "door" && this.#shell.glyphs && field?.kind === "field" && !field.disabled) this.#type(field);
  }

  layout(frame: Frame) {
    this.#screen.layout(frame);
  }

  press(button: RemoteButton, repeat: boolean) {
    this.#screen.press(button, repeat);
  }

  point(p: Point) {
    this.#screen.point(p);
  }

  update(dt: number) {
    this.#time += dt;
    this.#follow();
    const view = this.view;
    this.#reconcile();
    // Someone came or went, a room opened or filled, the room answered, or "Link copied" has had its moment.
    if (this.#key() !== this.#shape) {
      this.#refresh(view !== this.view ? (this.view === "door" ? "password" : undefined) : undefined);
      if (view !== this.view) this.#atDoor();
      return true;
    }
    return this.#screen.update(dt) || this.#shell.typing?.active != null;
  }

  /** What is being typed, into its field, and what Return or Escape did. */
  #follow() {
    const typing = this.#shell.typing;
    const view = this.#screen.view;
    view.typing.index = -1;
    if (!typing) return;
    const active = typing.active;
    const items = this.menu.items;
    const at = active ? items.findIndex((i) => i.id === active && i.kind === "field") : -1;
    if (at >= 0) {
      this.#store(active!, typing.value);
      if ((items[at] as FieldItem).value !== typing.value) {
        (items[at] as FieldItem).value = typing.value;
        this.#shell.menuChanged?.();
      }
      view.typing.index = at;
      view.typing.caret = typing.caret;
    }
    const ended = typing.take();
    if (!ended) return;
    const id = this.menu.focused?.id ?? "";
    this.#store(id, typing.value);
    const field = items.find((i) => i.id === id);
    if (field?.kind === "field") field.value = typing.value;
    this.#shell.menuChanged?.();
    if (ended !== "done") return;
    // Return on the code, or on a door's password, is going in.
    if (id === "code" && this.#code) {
      this.#joinCode();
    } else if (id === "password" && this.view === "door") this.#knock();
  }

  #joinCode() {
    const code = this.#code.trim().toLowerCase();
    if (isTableCode(code)) this.#shell.joinRoom(code);
    else {
      this.#note = "code";
      this.#refresh("code");
    }
  }

  /** Keeps what was typed into a field, by its id, for the view it is in. */
  #store(id: string, value: string) {
    if (id === "code") {
      if (value !== this.#code) {
        this.#code = value;
        this.#codeValid = isTableCode(value.trim().toLowerCase());
      }
    }
    else if (id === "name") this.#draft.name = value;
    else if (id === "password" && this.view === "new") this.#draft.password = value;
    else if (id === "password") this.#password = value;
  }

  draw(g: CanvasRenderingContext2D, t: number, hits: HitMap) {
    this.#screen.draw(g, t, hits);
  }

  /** The screen as tests and scripts read it. */
  publish(d: DOMStringMap) {
    d.onlineView = this.view;
    d.note = this.#note ?? "";
    d.typing = this.#shell.typing?.active ?? "";
    d.rooms = (this.#shell.rooms ?? []).map((r) => `${r.code}:${r.name}:${r.place}:${r.flies}:${r.locked ? 1 : 0}`).join(";");
  }
}
