// Online's rooms, as the screen shows them and as the remote works them: the
// list as the room server says it, a locked room's door, a new room, a code;
// and the line that lists the rooms.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableSocket, TableSocketStatus, TextEntry, TextRequest } from "@fly/contracts";
import { CLOSE, EVERYONE, MAX_FLIES, PROTOCOL, everyoneCode, seriesCode, seriesFor } from "@fly/net";
import type { RoomWire } from "@fly/net";
import { HitMap } from "@fly/ui";
import type { ActionItem, FieldItem } from "@fly/ui";
import { Pointers } from "../src/input.ts";
import { TV_FRAME } from "../src/display.ts";
import { Lobby } from "../src/online/lobby.ts";
import { suggestName } from "../src/online/invite.ts";
import { placeInfo } from "../src/places/catalog.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { OnlineScreen } from "../src/ui/screens/online.ts";
import { NativeTextEntry } from "../src/ui/text-entry.ts";
import type { Knock, NewRoom, Shell, TableNow } from "../src/ui/screens/types.ts";
import { blankCanvas, writtenOn } from "./canvas.ts";

/** Typing as a browser's input would: the test types, and presses Return or Escape. */
class FakeTyping implements TextEntry {
  active: string | null = null;
  value = "";
  caret = 0;
  request: TextRequest | null = null;
  #ended: "done" | "cancel" | null = null;
  begin(request: TextRequest) {
    this.request = request;
    this.active = request.id;
    this.value = request.value;
    this.caret = request.value.length;
  }
  end() {
    this.active = null;
  }
  type(text: string) {
    this.value += text;
    this.caret = this.value.length;
  }
  finish(how: "done" | "cancel") {
    this.active = null;
    this.#ended = how;
  }
  take() {
    const e = this.#ended;
    this.#ended = null;
    return e;
  }
}

const ROOMS: RoomWire[] = [
  { code: "aaaaaaaaaa", name: "Sunny Crumbs", place: "greenhouse", flies: 3, locked: false },
  { code: "bbbbbbbbbb", name: "Secret Sugar", place: "lab", flies: 1, locked: true },
  { code: "cccccccccc", name: "Packed", place: "picnic", flies: MAX_FLIES, locked: false },
];

const EVERYONE_ROOM: RoomWire = { code: EVERYONE, name: "Everyone", place: "picnic", flies: MAX_FLIES, locked: false, everyone: true };
const EVERYONE_TABLE: TableNow = { name: "Everyone", code: EVERYONE, link: `https://x/?table=${EVERYONE}`, starting: false, joined: true, everyone: true, others: [{ id: 1, colours: ["#ffd21f"] }] };

function world(canShare = true) {
  const typing = new FakeTyping();
  const did: string[] = [];
  const state = { lobbyStatus: "connecting" as Lobby["status"], rooms: null as RoomWire[] | null, table: null as TableNow | null, knock: null as Knock | null, ended: null as Shell["tableEnded"], started: null as NewRoom | null };
  const shell: Shell = {
    settings: { ...DEFAULT_SETTINGS },
    maxFlies: 4,
    brain: { status: "running" } as unknown as Shell["brain"],
    meter: {} as Shell["meter"],
    life: {} as Shell["life"],
    weatherOutside: false,
    weatherAttribution: () => null,
    shape: TV_FRAME,
    glyphs: null,
    open() {},
    back: () => did.push("back"),
    play() {},
    watch() {},
    applySettings() {},
    canPlayOnline: true,
    get table() {
      return state.table;
    },
    get tableEnded() {
      return state.ended;
    },
    get knock() {
      return state.knock;
    },
    door(room) {
      state.knock = room && { ...room, wrong: false, seq: (state.knock?.seq ?? 0) + 1 };
    },
    here: "windowsill",
    get rooms() {
      return state.rooms;
    },
    typing,
    get lobbyStatus() { return state.lobbyStatus; },
    canShare,
    startRoom(room) {
      state.started = room;
      did.push(`start ${room.name}`);
    },
    joinRoom: (code, password) => did.push(`join ${code}${password ? ` ${password}` : ""}`),
    shareTable: async () => "copied",
    removeFly: (id) => did.push(`remove ${id}`),
    leaveTable: () => did.push("leave"),
    get isOnline() {
      return shell.settings.joinOthers;
    },
    disconnect() {
      shell.settings.joinOthers = false;
      state.table = null;
      did.push("disconnect");
    },
    goOnline() {
      shell.settings.joinOthers = true;
      did.push("online");
    },
  };
  const screen = new OnlineScreen(shell);
  screen.enter();
  const step = () => screen.update(1 / 60);
  const press = (button: Parameters<OnlineScreen["press"]>[0]) => {
    screen.press(button, false);
    step();
  };
  /** Moves the focus to the item `id`, as the arrows do. */
  const focus = (id: string) => {
    for (let i = 0; i < 20 && screen.menu.focused?.id !== id; i++) press(screen.menu.items.findIndex((it) => it.id === id) > screen.menu.focus ? "down" : "up");
    assert.equal(screen.menu.focused?.id, id);
  };
  return { screen, shell, state, typing, did, step, press, focus };
}

test("the rooms: Disconnect, a new one, a code, then each listed room by its name, its place's colour, its flies as pips and a padlock; a full one can't be chosen", () => {
  const { screen, state, step } = world();
  assert.equal(screen.view, "rooms");
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["disconnect", "new", "code", "looking"], "until the room server has said");
  state.rooms = ROOMS;
  step();
  const rows = screen.menu.items as ActionItem[];
  assert.deepEqual(rows.map((i) => i.id), ["disconnect", "new", "code", "room:aaaaaaaaaa", "room:bbbbbbbbbb", "room:cccccccccc"]);
  assert.deepEqual([rows[3].label, rows[3].swatch, rows[3].count, rows[3].locked], ["Sunny Crumbs", placeInfo("greenhouse").colour, [3, MAX_FLIES], false]);
  assert.equal(rows[4].locked, true);
  assert.equal(rows[5].disabled, true, "full");
  // The list changes as the room server says: a room empties out of it.
  state.rooms = ROOMS.slice(1);
  step();
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["disconnect", "new", "code", "room:bbbbbbbbbb", "room:cccccccccc"]);
  state.rooms = [];
  step();
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["disconnect", "new", "code", "none"]);
});

test("Disconnect leaves for good, until Go online; at a room of someone's own, Leave the room goes back to everyone and Disconnect is alone", () => {
  const { screen, shell, state, did, step, press, focus } = world();
  state.table = EVERYONE_TABLE;
  step();
  focus("disconnect");
  press("select");
  assert.deepEqual(did, ["disconnect"]);
  assert.equal(shell.isOnline, false);
  assert.equal(screen.view, "rooms");
  assert.equal(screen.menu.focused?.id, "online");
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["online", "new", "code", "looking"], "the rooms can still be browsed, and joined, offline");
  press("select");
  assert.deepEqual(did, ["disconnect", "online"]);
  assert.equal(shell.isOnline, true);
  assert.equal(screen.menu.items[0].id, "disconnect");

  state.table = { name: "Sunny Crumbs", code: "abcdefghjk", link: "https://x/?table=abcdefghjk", starting: false, joined: true, everyone: false, others: [] };
  step();
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["share", "leave", "disconnect"]);
  assert.equal(screen.menu.item("leave")?.label, "Leave the room");
  focus("disconnect");
  press("select");
  assert.deepEqual(did, ["disconnect", "online", "disconnect"]);
  assert.equal(screen.view, "rooms");
});

test("a place's own room open to everyone is listed by its name alone; Everyone's say where they are now", () => {
  const { screen, state, step } = world();
  const lab = seriesFor("lab");
  state.rooms = [EVERYONE_ROOM, { code: seriesCode(lab), name: "Lab bench", place: "lab", flies: 2, locked: false, everyone: true }];
  step();
  const everyone = screen.menu.item(`room:${EVERYONE}`) as ActionItem;
  const own = screen.menu.item(`room:${seriesCode(lab)}`) as ActionItem;
  assert.equal(everyone.hint, placeInfo("picnic").name);
  assert.deepEqual([own.label, own.hint, own.description, own.swatch, own.everyone], ["Lab bench", undefined, undefined, placeInfo("lab").colour, true], "said once, to the eye and to a screen reader");
  assert.equal(everyone.description, placeInfo("picnic").name);
});

test("an open room is joined by choosing it; a locked one shows its door, where the password typed and Return go in", () => {
  const { screen, state, typing, did, press, focus, step } = world();
  state.rooms = ROOMS;
  step();
  focus("room:aaaaaaaaaa");
  press("select");
  assert.deepEqual(did, ["join aaaaaaaaaa"]);

  focus("room:bbbbbbbbbb");
  press("select");
  assert.equal(screen.view, "door");
  assert.equal(screen.menu.focused?.id, "password");
  const join = () => screen.menu.items.find((i) => i.id === "join")!;
  assert.equal(join().disabled, true, "nothing to go in with yet");
  press("select");
  assert.deepEqual(typing.request, { id: "password", kind: "password", value: "", max: 64, label: "Password" });
  typing.type("hunter2");
  step();
  const field = screen.menu.items[0] as FieldItem;
  assert.equal(field.value, "hunter2");
  assert.equal(field.secret, true, "shown as dots");
  typing.finish("done");
  step();
  assert.deepEqual(did.at(-1), "join bbbbbbbbbb hunter2");

  // The room said no: the door again, saying so where its name was.
  state.knock = { code: "bbbbbbbbbb", name: "Secret Sugar", wrong: true, seq: 9 };
  state.ended = "locked";
  step();
  assert.equal(screen.view, "door");
  assert.equal(screen.note, "wrong");
  assert.equal((screen.menu.items[0] as FieldItem).value, "", "to type again");
  // Typing again, the note goes.
  press("select");
  assert.equal(screen.note, "");
  // Back is the list again.
  typing.finish("cancel");
  step();
  press("back");
  assert.equal(screen.view, "rooms");
  assert.equal(state.knock, null);
});

test("while the door opens it says so, and once in, the room's own face: its name, its link, leaving it", () => {
  const { screen, state, did, step } = world();
  state.knock = { code: "bbbbbbbbbb", name: "Secret Sugar", wrong: false, seq: 1 };
  step();
  assert.equal(screen.view, "door");
  state.table = { name: null, code: "bbbbbbbbbb", link: "https://x/?table=bbbbbbbbbb", starting: false, joined: false, everyone: false, others: [] };
  step();
  assert.equal(screen.view, "door", "on its way in");
  assert.deepEqual(screen.menu.items.map((i) => [i.id, i.label, !!i.disabled]), [["password", "Password", true], ["join", "Joining…", true]]);
  state.table = { name: "Secret Sugar", code: "bbbbbbbbbb", link: "https://x/?table=bbbbbbbbbb", starting: false, joined: true, everyone: false, others: [{ id: 1, colours: ["#ffd21f"] }] };
  state.knock = null;
  step();
  assert.equal(screen.view, "room");
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["share", "leave", "disconnect"], "only the starter removes flies");
  screen.press("down", false);
  screen.press("select", false);
  assert.deepEqual(did, ["leave"]);
});

test("at a room, its QR code and its code beside the menu, once in; Share only where a link can be handed on", () => {
  for (const canShare of [true, false]) {
    const { screen, state, step } = world(canShare);
    state.table = { name: "Sunny Crumbs", code: "abcdefghjk", link: "https://x/?table=abcdefghjk", starting: false, joined: true, everyone: false, others: [] };
    step();
    assert.deepEqual(screen.menu.items.map((i) => i.id), canShare ? ["share", "leave", "disconnect"] : ["leave", "disconnect"]);
    const g = blankCanvas();
    screen.draw(g, 0, new HitMap());
    // The code in two halves, read in groups of five and typed as one.
    assert.deepEqual(writtenOn(g).filter((w) => /^[a-z]{5}$/.test(w.text)).map((w) => w.text), ["abcde", "fghjk"]);
  }
  // On the way in there is no card yet.
  const { screen, state, step } = world();
  state.table = { name: null, code: "abcdefghjk", link: "https://x/?table=abcdefghjk", starting: false, joined: false, everyone: false, others: [] };
  step();
  const g = blankCanvas();
  screen.draw(g, 0, new HitMap());
  assert.ok(!writtenOn(g).some((w) => w.text === "abcde"));
});

test("a room open to everyone offers sharing where available, browsing the rooms and disconnecting, not leaving", () => {
  for (const canShare of [true, false]) {
    const { screen, state, step } = world(canShare);
    state.table = EVERYONE_TABLE;
    step();
    assert.equal(screen.view, "room");
    assert.deepEqual(screen.menu.items.map((item) => item.id), canShare ? ["share", "rooms", "disconnect"] : ["rooms", "disconnect"]);
    assert.equal(screen.menu.item("rooms")?.label, "Browse rooms");
  }
});

test("looking at other rooms keeps the current table, and choosing it or pressing Back returns to its room view", () => {
  for (const returnBy of ["current", "back"]) {
    const { screen, shell, state, did, step, press, focus } = world();
    state.table = EVERYONE_TABLE;
    state.rooms = [EVERYONE_ROOM, ...ROOMS];
    step();
    focus("rooms");
    press("select");
    step();
    assert.equal(screen.view, "rooms", "the next frame does not return to the occupied room");
    assert.deepEqual(screen.menu.items.map((item) => item.id), ["new", "code", `room:${EVERYONE}`, ...ROOMS.map((room) => `room:${room.code}`)]);
    assert.equal(shell.table, EVERYONE_TABLE);
    assert.deepEqual(did, [], "browsing leaves the fly where it is");
    if (returnBy === "current") {
      focus(`room:${EVERYONE}`);
      press("select");
    } else press("back");
    step();
    assert.equal(screen.view, "room", returnBy);
    assert.equal(shell.table, EVERYONE_TABLE);
    assert.deepEqual(did, [], "returning neither joins nor leaves nor closes Online");
  }
});

test("a locked room's door, come to from a room open to everyone, can be typed into and joined: being in that room isn't being on the way into this one", () => {
  const { screen, state, did, step, press, focus } = world();
  const locked = ROOMS.find((room) => room.locked)!;
  state.table = EVERYONE_TABLE;
  state.rooms = [EVERYONE_ROOM, ...ROOMS];
  step();
  focus("rooms");
  press("select");
  focus(`room:${locked.code}`);
  press("select");
  step();
  assert.equal(screen.view, "door");
  assert.deepEqual(screen.menu.items.map((i) => [i.id, i.label, !!i.disabled]), [["password", "Password", false], ["join", "Join", true]]);
  assert.deepEqual(did, [], "nothing joined or left before the password");
});

test("a full room open to everyone remains selectable and marked as everyone's while a full ordinary room is disabled", () => {
  const { screen, state, step, press, focus, did } = world();
  state.rooms = [EVERYONE_ROOM, ...ROOMS];
  step();
  const everyone = screen.menu.item(`room:${EVERYONE}`) as ActionItem;
  assert.equal(everyone.everyone, true);
  assert.equal(everyone.disabled, false);
  assert.deepEqual(everyone.count, [MAX_FLIES, MAX_FLIES]);
  const ordinary = screen.menu.item(`room:${ROOMS[2].code}`) as ActionItem;
  assert.equal(ordinary.everyone, false);
  assert.equal(ordinary.disabled, true);
  focus(`room:${EVERYONE}`);
  press("select");
  assert.deepEqual(did, [`join ${EVERYONE}`], "the server can send a full everyone room's next arrival on to another");
});

test("choosing another room while at everyone's table asks the shell to join its code", () => {
  for (const room of [ROOMS[0], { ...EVERYONE_ROOM, code: everyoneCode(1), name: "Everyone 2" }]) {
    const { shell, state, did, step, press, focus } = world();
    state.table = EVERYONE_TABLE;
    state.rooms = [EVERYONE_ROOM, room];
    step();
    focus("rooms");
    press("select");
    focus(`room:${room.code}`);
    press("select");
    assert.deepEqual(did, [`join ${room.code}`]);
    assert.equal(shell.table, EVERYONE_TABLE, "the shell owns leaving the old table before joining the new one");
  }
});

test("on the Apple TV a field is typed on the system's keyboard: the whole of it at once, Back giving up, another field or leaving taking it down", () => {
  const asked: { title: string; value: string; kind: string; done: (text: string | null) => void }[] = [];
  let closed = 0;
  const typing = new NativeTextEntry({ ask: (title, value, kind, done) => asked.push({ title, value, kind, done }), close: () => closed++ });
  typing.begin({ id: "code", kind: "code", value: "", max: 10, label: "Code" });
  assert.deepEqual([typing.active, asked[0].title, asked[0].kind], ["code", "Code", "code"]);
  assert.equal(typing.take(), null, "nothing until the keyboard answers");
  asked[0].done("ABCDEFGHJKLM");
  assert.deepEqual([typing.active, typing.value, typing.caret, typing.take(), typing.take()], [null, "ABCDEFGHJK", 10, "done", null], "as typed, to the field's length");
  typing.begin({ id: "password", kind: "password", value: "old", max: 32, label: "Password" });
  asked[1].done(null);
  assert.deepEqual([typing.value, typing.take()], ["old", "cancel"], "going back keeps what it held");
  typing.begin({ id: "name", kind: "name", value: "a", max: 24 });
  typing.begin({ id: "password", kind: "new-password", value: "", max: 32 });
  asked[2].done(null);
  assert.equal(typing.active, "password", "an answer to a question since given up is no one's");
  typing.end();
  assert.equal(closed, 1);
  asked[3].done("late");
  assert.deepEqual([typing.active, typing.value, typing.take()], [null, "", null]);
});

test("a new room: a name suggested, the place the fly is in, listed, no password; a name that can't be one is said so; Create makes it", () => {
  const { screen, state, typing, did, press, focus, step } = world();
  focus("new");
  press("select");
  assert.equal(screen.view, "new");
  assert.equal(screen.menu.focused?.id, "create", "ready to go as it is");
  const name = screen.menu.items[0] as FieldItem;
  assert.match(name.value, /^\S+ \S+$/);
  assert.deepEqual(screen.menu.items.map((i) => i.id), ["name", "place", "listed", "password", "create"]);

  focus("name");
  press("select");
  assert.equal(typing.request?.kind, "name");
  typing.value = "";
  typing.type("fly 🪰");
  typing.finish("done");
  step();
  focus("listed");
  press("right");
  focus("password");
  press("select");
  assert.equal(typing.request?.kind, "new-password", "for a password manager to keep");
  typing.type("pw");
  typing.finish("done");
  step();
  focus("create");
  press("select");
  assert.equal(screen.note, "name");
  assert.equal(did.length, 0);

  focus("name");
  press("select");
  typing.value = "";
  typing.type("  Late   Night ");
  typing.finish("done");
  step();
  focus("create");
  press("select");
  assert.deepEqual(state.started, { name: "Late Night", listed: false, password: "pw", place: "windowsill" });
});

test("a code typed and Return joins its room; one that can't be a code is said so", () => {
  const { screen, typing, did, press, focus, step } = world();
  focus("code");
  press("select");
  assert.deepEqual(typing.request, { id: "code", kind: "code", value: "", max: 10, label: "Code" });
  typing.type("nope");
  typing.finish("done");
  step();
  assert.equal(screen.note, "code");
  press("select");
  typing.value = "";
  typing.type("ABCDEFGHJK");
  typing.finish("done");
  step();
  assert.deepEqual(did, ["join abcdefghjk"]);
});

test("a room that turned the device away for being full, or gone, says so", () => {
  const { screen, state, step } = world();
  state.ended = "full";
  step();
  assert.equal(screen.note, "full");
});

test("suggested names are two words, from a few each", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(suggestName());
  assert.ok(seen.size > 50);
  for (const name of seen) assert.match(name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
});

class FakeSocket implements TableSocket {
  status: TableSocketStatus = "connecting";
  closeCode = 0;
  closeReason = "";
  readonly sent: string[] = [];
  readonly inbox: string[] = [];
  send(data: string | Uint8Array) {
    if (typeof data === "string") this.sent.push(data);
  }
  drain(text: (m: string) => void) {
    for (const m of this.inbox.splice(0)) text(m);
  }
  close() {
    this.status = "closed";
  }
}

test("the lobby asks to browse once open, takes each list it is told (only well-formed rooms), and opens again when it drops", () => {
  const sockets: FakeSocket[] = [];
  const lobby = new Lobby(() => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  }, "ws://rooms");
  lobby.update(0.016);
  assert.deepEqual(sockets[0].sent, []);
  sockets[0].status = "open";
  lobby.update(0.016);
  assert.deepEqual(sockets[0].sent.map((m) => JSON.parse(m)), [{ type: "browse", v: PROTOCOL }]);
  assert.equal(lobby.rooms, null);
  sockets[0].inbox.push(JSON.stringify({ type: "rooms", rooms: [ROOMS[0], { code: "x", name: 3 }] }));
  lobby.update(0.016);
  assert.deepEqual(lobby.rooms, [ROOMS[0]]);
  assert.equal(lobby.status, "open");

  sockets[0].status = "closed";
  sockets[0].closeCode = 1006;
  lobby.update(0.016);
  assert.equal(lobby.status, "stale");
  assert.deepEqual(lobby.rooms, [ROOMS[0]], "the last list it had, until it hears again");
  lobby.update(1);
  assert.equal(sockets.length, 2, "again");
  sockets[1].status = "closed";
  sockets[1].closeCode = CLOSE.version;
  lobby.update(0.016);
  assert.equal(lobby.status, "version", "a newer room server: the page reloads");
});

test("the starter removes a whole device using one row with all its flies' colour swatches", () => {
  const { screen, state, step, focus, did } = world();
  const colours = ["#2fb8ff", "#ff4fa3", "#59e05a"];
  state.table = { name: "Sunny Crumbs", code: "abcdefghjk", link: "https://x/?table=abcdefghjk", starting: true, joined: true, everyone: false, others: [{ id: 2, colours }] };
  step();
  const row = screen.menu.items.find((i) => i.id.startsWith("remove:2:"));
  assert.ok(row?.kind === "action");
  assert.equal(row.label, "Remove");
  assert.deepEqual(row.swatch, colours);
  focus(row.id);
  screen.press("select", false);
  assert.deepEqual(did, ["remove 2"]);
});

test("room refreshes never turn a drawn room or removal into a different action", () => {
  for (const action of ["join", "remove"] as const) {
    for (const change of ["insert", "remove", "reorder"] as const) {
      for (const timing of ["before down", "while held"] as const) {
        for (const redraw of [false, true]) {
          const { screen, state, step, did } = world();
          const rooms = [ROOMS[0], { ...ROOMS[1], locked: false }];
          const others = [{ id: 2, colours: ["red"] }, { id: 3, colours: ["blue", "pink"] }];
          if (action === "join") state.rooms = rooms;
          else state.table = { name: "Table", code: ROOMS[0].code, link: "", starting: true, joined: true, everyone: false, others };
          step();
          const index = screen.menu.items.findIndex((item) => action === "join" ? item.id === `room:${ROOMS[0].code}` : item.id.startsWith("remove:2:"));
          const hits = new HitMap();
          const draw = () => { hits.begin("online"); screen.draw(blankCanvas(), 0, hits); };
          draw();
          const drawn = Array.from({ length: hits.count }, (_, i) => hits.get(i)!).find((hit) => hit.kind === "row" && hit.index === index)!;
          assert.ok(drawn);
          const hit = { ...drawn };
          const point = (type: "down" | "up") => screen.point({ type, x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, dx: 0, dy: 0, tap: true, hit });
          if (timing === "while held") point("down");
          if (action === "join") {
            state.rooms = change === "insert" ? [ROOMS[2], ...rooms] : change === "remove" ? rooms.slice(1) : [...rooms].reverse();
          } else {
            state.table = { ...state.table!, others: change === "insert" ? [{ id: 4, colours: ["green"] }, ...others] : change === "remove" ? others.slice(1) : [...others].reverse() };
          }
          step();
          if (redraw) draw();
          if (timing === "before down") point("down");
          point("up");
          assert.deepEqual(did, [], `${action}: ${change}, ${timing}, redraw ${redraw}`);
        }
      }
    }
  }
});

test("a room tap must release on its pressed action, while an unchanged drawn room still joins", () => {
  const { screen, state, step, did } = world();
  state.rooms = [ROOMS[0], { ...ROOMS[1], locked: false }];
  step();
  const hits = new HitMap();
  hits.begin("online");
  screen.draw(blankCanvas(), 0, hits);
  const rows = Array.from({ length: hits.count }, (_, i) => hits.get(i)!).filter((hit) => hit.kind === "row" && screen.menu.items[hit.index].id.startsWith("room:"));
  const point = (type: "down" | "up", hit: (typeof rows)[number]) => screen.point({ type, hit, x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, dx: 0, dy: 0, tap: true });
  point("down", rows[0]);
  point("up", rows[1]);
  assert.deepEqual(did, []);
  point("down", rows[0]);
  point("up", rows[0]);
  assert.deepEqual(did, [`join ${ROOMS[0].code}`]);
});

test("a departed player's reused seat cannot inherit its drawn removal target", () => {
  for (const held of [false, true]) {
    const { screen, state, step, did } = world();
    const table = { name: "Table", code: ROOMS[0].code, link: "", starting: true, joined: true, everyone: false, others: [{ id: 2, colours: ["red", "blue"] }] };
    state.table = table;
    step();
    const hits = new HitMap();
    hits.begin("online");
    screen.draw(blankCanvas(), 0, hits);
    const drawn = Array.from({ length: hits.count }, (_, i) => hits.get(i)!).find((hit) => hit.kind === "row" && screen.menu.items[hit.index].id.startsWith("remove:"))!;
    const hit = { ...drawn };
    const point = (type: "down" | "up") => screen.point({ type, hit, x: hit.x, y: hit.y, dx: 0, dy: 0, tap: true });
    if (held) point("down");
    state.table = { ...table, others: [{ id: 2, colours: ["red", "blue"] }] };
    step();
    if (!held) point("down");
    point("up");
    assert.deepEqual(did, [], `seat reused ${held ? "while held" : "before press"}`);
  }
});


test("pointer release uses the redrawn target and cancels a changed room", () => {
  const { screen, state, step, did } = world();
  state.rooms = [ROOMS[0], { ...ROOMS[1], locked: false }];
  step();
  const hits = new HitMap();
  const draw = () => { hits.begin("online"); screen.draw(blankCanvas(), 0, hits); };
  draw();
  const row = Array.from({ length: hits.count }, (_, i) => hits.get(i)!).find((hit) => hit.kind === "row" && screen.menu.items[hit.index].id === `room:${ROOMS[0].code}`)!;
  const x = row.x + row.w / 2, y = row.y + row.h / 2;
  const pointers = new Pointers(() => ({ left: 0, top: 0, width: TV_FRAME.design.width, height: TV_FRAME.design.height }));
  const event = { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, button: 0, buttons: 1 };
  const send = () => {
    for (const gesture of pointers.gestures) {
      if (gesture.type !== "down" && gesture.type !== "up") continue;
      const hit = hits.at(gesture.x * TV_FRAME.design.width, gesture.y * TV_FRAME.design.height);
      screen.point({ type: gesture.type, x, y, hit, tap: gesture.type === "up" && gesture.tap, dx: 0, dy: 0 });
    }
    pointers.endFrame();
  };
  pointers.down(event);
  send();
  // Change this menu in place so its held press survives the redraw.
  const items = screen.menu.items;
  [items[row.index], items[row.index + 1]] = [items[row.index + 1], items[row.index]];
  draw();
  pointers.up({ ...event, buttons: 0 }, false);
  send();
  assert.deepEqual(did, []);
});

test("a valid room code has an in-engine Join action with the same result as Return", () => {
  const { screen, typing, did, focus, press, step } = world();
  focus("code");
  press("select");
  const clickSubmit = (stale = false) => {
    const hits = new HitMap();
    screen.draw(blankCanvas(), 0, hits);
    const hit = Array.from({ length: hits.count }, (_, i) => hits.get(i)!).find((h) => h.kind === "submit")!;
    assert.ok(hit && hit.w >= 44 && hit.h >= 36);
    const point = { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, dx: 0, dy: 0, hit: stale ? { ...hit, id: "expired" } : hit, tap: true };
    screen.point({ ...point, type: "down" });
    screen.point({ ...point, type: "up" });
  };
  clickSubmit();
  assert.deepEqual(did, [], "an empty code cannot be submitted");
  typing.type("ABCDEFGHJK");
  step();
  assert.equal((screen.menu.item("code") as FieldItem).submit?.disabled, false);
  clickSubmit(true);
  assert.deepEqual(did, [], "a submit target must retain its drawn identity");
  clickSubmit();
  assert.deepEqual(did, ["join abcdefghjk"]);
  assert.equal(typing.active, null);
});

test("a non-message JSON value cannot stop the room list receiving a later list", () => {
  const socket = new FakeSocket();
  const lobby = new Lobby(() => socket, "ws://rooms");
  socket.status = "open";
  socket.inbox.push("null");
  assert.doesNotThrow(() => lobby.update(0));
  assert.equal(lobby.rooms, null);
  socket.inbox.push(JSON.stringify({ type: "rooms", rooms: ROOMS }));
  lobby.update(0);
  assert.deepEqual(lobby.rooms, ROOMS);
  lobby.close();
});

test("room discovery failures replace searching, stale choices are disabled, and recovery clears the message", () => {
  const { screen, state, step, press, did } = world();
  state.lobbyStatus = "lost";
  step();
  assert.equal(screen.menu.items.at(-1)?.label, "Can't reach rooms");
  state.rooms = ROOMS;
  state.lobbyStatus = "stale";
  step();
  assert.equal(screen.menu.items[3].label, "Reconnecting…");
  assert.ok(screen.menu.items.slice(4).every((item) => item.disabled));
  state.lobbyStatus = "version";
  step();
  const g = blankCanvas(); screen.draw(g, 0, new HitMap());
  assert.equal(writtenOn(g).filter((w) => w.text === "Update needed").length, 1);
  // Being alone is always within reach.
  assert.ok(screen.menu.items.every((item) => !!item.disabled === (item.id !== "disconnect")));
  state.lobbyStatus = "open";
  step();
  assert.ok(!screen.menu.items.some((item) => item.id === "unavailable"));
  assert.equal(screen.menu.items[3].disabled, false);
  press("back");
  assert.deepEqual(did, ["back"], "solo remains reachable");
});

test("a version mismatch disables forms already open and says an update is needed", () => {
  const { screen, state, step, press, focus, did } = world();
  focus("new"); press("select");
  state.lobbyStatus = "version"; step();
  assert.equal(screen.menu.items.find((i) => i.id === "create")?.disabled, true);
  const g = blankCanvas(); screen.draw(g, 0, new HitMap());
  assert.ok(writtenOn(g).some((w) => w.text === "Update needed"));
  press("select"); assert.deepEqual(did, []);
  press("back"); press("back"); assert.deepEqual(did, ["back"]);
  state.knock = { code: "bbbbbbbbbb", name: "Secret Sugar", wrong: false, seq: 1 }; step();
  assert.equal(screen.menu.items.find((i) => i.id === "join")?.disabled, true);
});

test("an invitation's version failure clears when compatible discovery recovers", () => {
  const { screen, state, step, press, focus } = world();
  state.ended = "version"; step();
  assert.equal(screen.note, "version");
  assert.equal(screen.menu.item("new")?.disabled, true);
  state.lobbyStatus = "open"; state.rooms = []; step();
  assert.equal(screen.note, "");
  assert.equal(screen.menu.item("new")?.disabled, false);
  focus("new"); press("select");
  assert.equal(screen.menu.items.find((item) => item.id === "create")?.disabled, false);
});

test("let into a room while the list showed, or opened again, Online starts at the top of what it shows, not on a row that shares the last one's id", () => {
  const { screen, state, step } = world();
  assert.equal(screen.menu.focused?.id, "disconnect");
  state.table = EVERYONE_TABLE;
  step();
  assert.equal(screen.view, "room");
  assert.equal(screen.menu.focused?.id, "share");
  screen.menu.focusOn("disconnect");
  screen.enter();
  assert.equal(screen.menu.focused?.id, "share");
});
