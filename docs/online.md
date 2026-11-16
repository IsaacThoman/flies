# Flies online

Up to eight people's flies can share a room (a table, in the code: the
place the flies share). Each fly's brain and body run
on its owner's device, exactly as they do alone. A small room server
(`apps/server`) runs no brains and draws nothing: it passes each fly's state
on to the others, and it owns the rest of the world there. That means the
place, the food, thrown balls, the light and the weather, and the seed and
clock the bubbles and visitors come from. Each fly sees the others with its
own eyes and meets them with its own body. Nothing else passes between flies.

This is the web's, for now. The Apple TV and the iPhone app join later
through a native WebSocket bridge (below).

## Playing

- **The rooms.** The menu → Online lists every public room with someone in
  it, fullest first: its name, its place's colour, its flies as eight pips
  and a padlock if it has a password. The list follows the room server as
  rooms open, fill and empty. A full one can't be chosen. Above the list are
  New room, and Code, for an unlisted room's code (the ten letters of its
  link).
- **A new room.** New room → its name (two words are suggested, to keep or
  type over), its place (the fly's own to start with), Public or Unlisted
  and a password (none, unless one is typed). Create sits this device's
  fly there, under its light and weather. Share the link opens the system's
  share sheet, or copies the link where there is none. The link is
  `https://<site>/?table=<code>`. Ten letters and digits (about 50 bits):
  for an unlisted room without a password, they are the only permission
  there is.
- **A locked room.** Choosing one from the list, or opening its link or
  code, comes to its door: its password, then Join. With a remote or the
  keys in hand the password is typed at once; with a finger, a tap on it.
  A wrong one says so where the room's name was, in pink, and the password
  is typed again. A device that has once sat at the room comes back to it
  (a dropped line, a reload) without it; its starter never needs it.
- **Joining.** Choosing an open room, typing its code, or opening its link sits this device's fly at the room, set
  down near the others, at the height of the place's start (in the
  restaurant, on the window table, not the floor under it). The device remembers its table: a reload, or opening
  the site again, comes back to it until it leaves.
- **Who is who.** No names and no chat. Each fly wears a dab of enamel on its
  thorax in its player's colour, as researchers mark flies. Other players'
  pointers show as rings in their colours. Your fly is the one the camera
  follows.
- **The starter** chooses the place (the Place tool carries the whole table
  there together), the light and the weather (their tools). Everyone else's
  Light, Weather and Place tools show the table's choice and refuse to change
  it. The starter can also take a fly off the table: Online lists the
  others by colour, each with Remove. A removed device can't sit at that
  table again.
- **The table's clock** is the starter's. Their time zone goes with the
  table when it is started, so "Now" on the Light tool is their time of day.
  "Now" on the Weather tool is the made-up forecast from that clock, so
  everyone sees the same rain. The real weather outside (WeatherKit) isn't
  used at a table.
- **Tools on other flies.** The table is invite-only, so everyone's tools
  reach everyone's fly through the world. A ball thrown is seen coming by
  every fly, a feather or a puff is felt by whichever fly it touches, and
  food dropped is food for all. This follows rule 1: other players act on
  your fly only through its senses.
- **Away.** A hidden tab, a sleeping phone or a dropped connection leaves the
  fly at the table, resting: wings folded, still, its body dimmed. After 10
  minutes away it leaves; when its device comes back, it sits down again where
  it was, in its colour.
- **Leaving.** Online → Leave the room. The fly stays where it is, alone,
  with the place's own food, and the light and weather its shelf had.
- **What goes wrong** is said in the heading's place, in a few words: a
  wrong password, too many tries, a full room, one that has closed, being
  taken off one.

### Typing

Names, passwords and codes are typed into fields the game draws. In a
browser the keys go to one `<input>` that is never seen
(`apps/web/src/ui/text-entry.ts`), focused while a field is being typed
into, so a physical keyboard, a phone's or a tablet's own keyboard, input
methods, paste and password managers all work: a password field is a
password to them (`current-password` at a door, `new-password` for a new
room). A phone shows its keyboard only for a field focused during a tap, so
the tap on a field focuses it as it lifts, not a frame later
(`Game.#typeOnTap`). The game draws the field from the input's value and
caret, a password as dots. Return finishes (at a door, it is Join; in Code,
it is going in), Escape puts the field back as it was. A game pad has no
keys to type with: a new room's suggested name lets it make one, and it can
join any open room; a password needs a keyboard. The game reaches typing only
through `TextEntry` (`packages/contracts/src/text-entry.ts`), polled each
frame, so the Apple TV can bring its own keyboard through the bridge.

When not at a table nothing here runs: no connection, no other bodies, and
the single-player game as it was.

## Who owns what

| | Owner | How the others get it |
| --- | --- | --- |
| A fly: where it is, its pose, its hand | Its player's device, where its brain and body run | About 20 states a second through the room, drawn about 100 ms in the past, interpolated (`packages/net/src/track.ts`) |
| What a fly feels and does about the others | Its own device | The others are bodies its eyes see and its body meets (`packages/body/src/crowd.ts`); their hands are the same `Hands` as yours, driven from the wire (`apps/web/src/online/other-hands.ts`) |
| The food: the place's patches, what is dropped, what the place puts out | The room (`TableFood`) | Each device eats at once and tells the room; the room's account, less what the device has eaten since, is what is left (`FoodMirror`) |
| A thrown ball | The room's clock | Its path and the moment its dive starts: every device (and the room) puts it in the same place at the same moment (`ball.ts`), a round trip after Select so everyone sees the whole dive |
| The place | The room | `place` tells every device to carry its fly there, and where each fly is set down |
| The light, the weather, the clock | The room, chosen by the starter | `world` and the welcome's clock; "Now" follows the starter's time zone |
| The high bubbles | The room's seed and clock | Each device works them out (`bubbles.ts`); a device whose fly bursts one says so |
| Visitors (gust, gull, leaf, butterfly, ladybird, juice, boat) | The room says when, with a seed (the picnic's pace, `@fly/world`) | Each device starts the visit from that seed (`SceneSet.happen`); visitors keep clear of whichever fly is nearest |
| The restaurant's ventilation | The room says when it comes on, by the same clock as alone (`VentilationClock`, `@fly/world`), with a seed | Each device draws how long it runs from the seed (`SceneSet.happen`), so every fly feels the same draught at the same time |

The four low bubbles that bob past each fly stay each device's own, so
nobody else sees yours.

## The wire

One WebSocket per device, at `wss://<site>/rooms`. The first message is the
device's `hello`, carrying the protocol version (now 3); the room refuses any
other, and a page it refuses for its version reloads itself once, into the
site's current game. A connection that only lists the rooms says `browse`
instead, and is told `rooms` at once and again whenever the list changes
(checked every 2 s); nothing else it says is listened to. The fast traffic is binary and little-endian, with a type byte
first; everything rare is JSON (`packages/net/src/protocol.ts`,
`ClientMessage` and `ServerMessage`).

| Type | Direction | Layout | Bytes |
| --- | --- | --- | --- |
| 1 `FLY` | device to room, every 50 ms | type, state | 33, or 47 with the hand |
| 2 `FLIES` | room to device, every 50 ms when anything is new | type, count, then each fly's player id and state | 2 + 33 or 47 a fly |
| 3 `BITES` | device to room, at most every 100 ms | type, sequence (u16), count, then each food's id (u32) and amount (f32) | 4 + 8 a bite |

A fly's state (32 bytes, 46 with the hand). Its lengths are at its place's
scale (`wireScale`), the finest that holds the place's floor and ceiling
with room for a fly in the air past the edge:

| Scale | Places | Position | Pointer | Camera |
| --- | --- | --- | --- | --- |
| A tabletop's | picnic, windowsill, lab, bar (floors within 500 mm of their middle) | 1/50 mm (±655 mm) | 1/20 mm (±1.6 m) | 1/10 mm (±3.3 m) |
| A room's | restaurant (within 5 m: its floor is 4.2 by 3 m from its middle) | 1/5 mm (±6.5 m) | 1/4 mm (±8.2 m) | 1/2 mm (±16 m) |

A length out of its scale's range is held at its end, never wrapped. Both
ends always know which place a state is from: the table's place, in the
epoch the state carries. The room reads every state at its place's scale
and drops one from another epoch before using it; a device reads the
others' at the scale of the place the table is in (the one it is being
carried to, during a move), and drops theirs from any other epoch. Another
fly is drawn half a step up from where the wire puts it, so rounding never
sinks one on its feet into what it stands on.

Protocol 3 is protocol 2 with rooms: names, the list, and passwords. A
device speaking 2 doesn't know a room can be locked, and would knock at a
locked door forever, so it is turned away and reloads into 3.

Protocol 2 is protocol 1 with each place's own scale. A tabletop's states
are the same bytes as before, but the room is a place protocol 1 can't
read: a device that doesn't know the restaurant would read its states at a
tabletop's scale, clamped and wrong, and can't be carried there. So the
version changed, and a device speaking 1 is turned away (and reloads into 2)
rather than sitting at a table that may move to the restaurant.

| Field | Encoding |
| --- | --- |
| flags | u8: airborne 1, away (its device has stopped) 2, eating 4, hand out 8, holding Select 16, at the remote 32 |
| epoch | u8, the room's count of moves to another place: a state from before a move is dropped |
| sequence | u16, wrapping |
| time | u32, room ms when the fly was there |
| position | 3 × i16, at the place's scale |
| heading | u16, a turn in 65,536 |
| the ground's normal | 2 × i8, x and z (y follows) |
| velocity | 3 × i16, mm/s |
| pose | i8 speed (¼ body length/s), i8 turn (1/16 rad/s), u8 wings, groom, feed, crouch (1/255), i8 pitch (1/150 rad), i8 roll (1/200 rad) |
| the hand, if out | 3 × i16 pointer, 3 × i16 camera (for the way a puff blows), each at the place's scale, u8 tool, u8 kind |

JSON, from the device:

| Message | |
| --- | --- |
| `hello {v, table, key, start?, password?, at?, epoch?}` | the table's code; this device's key; `start` (place, light, weather, time zone and offset, and the room's `name` and whether it is `listed`) to start the table if it doesn't exist; `password`, the lock a new room is to have, or the key to a locked one, sent only until welcomed; `at`, where its fly is, coming back after a moment away, and the `epoch` of the place it is in |
| `browse {v}` | instead of a hello: this connection only lists the rooms |
| `ping {t}` | answered `pong {t, now}` with the room's time |
| `drop {id, kind, x, z, y, at}` | food dropped onto the surface at or below `y` (the floor under a table, or the table), named by the device (player id × 1,000,000 + its count) so its fly can eat it before the room has heard |
| `ball {at, from, via, to}` | a throw, starting at room time `at` |
| `world {light, weather}`, `place {place}`, `remove {id}` | the starter's choices |
| `pop {slot, cycle, at}` | its fly burst a bubble |
| `found {id, name, x, z, y, r, sweet}` | the place put food out on this device, named from where it lies |
| `bye` | leaving for good |

From the room:

| Message | |
| --- | --- |
| `welcome {v, id, colour, starter, seed, now, wall, offset, place, epoch, world, players, foods, balls, happenings, bubbles, at, room}` | the table as it is, where this fly stands, and the room's `{name, listed, locked}`; then a `FLIES` batch of every other fly where it is now |
| `refused {reason, name?}` | then the connection closes with the matching code: version 4001, full 4002, removed 4003, unknown table 4004, busy 4005 (too many rooms started, or passwords tried), malformed 4006, the same key sat down elsewhere 4007, locked 4008 (no password, or the wrong one: with the room's `name`, for its door); 4010 after `bye` |
| `rooms {rooms}` | to a browsing connection: each listed room with a fly there, fullest first, at most 50, as `{code, name, place, flies, locked}` |
| `joined {id, colour, away}`, `away {id, away}`, `left {id}` | who is at the table, and whose device has stopped |
| `drop`, `ball`, `found`, `pop` | as above, to everyone else (`by` the player); a drop's `y` is the surface it lands on |
| `world {light, weather, offset}`, `place {place, epoch, foods, spots}` | the starter's choices, to everyone; `spots` is where each fly is set down |

A spot (`at`, `spots`) is x, z, yaw and the height of the surface the fly
stands on, and each of `foods` carries the height it lies at: in the
restaurant one point can be the floor, a chair seat or the table over them.
| `happening {kind, seed, at}` | a visitor comes |
| `food {ack, amounts, gone, eaten}` | at most ten times a second while food changes: what is left, what is gone, this player's total by the room's account, and the last of its bites counted |

### Coming back

A dropped line is opened again after 0.5, 1, 2, 4, 8, then 15 s, and at once
when the page is shown again. A deploy closes every connection with 1012;
devices come back within 0.3 to 1.5 s, spread out. The hello names the
device's key, and the room gives it back its seat: the same id and colour.
Its fly carries on where it is if that is in the place the table is in (the
hello's epoch) and within a walk of where the room last had it (20 mm/s for
up to 10 s, on the same table or floor); otherwise it is put back where the
room had it. The room keeps every table in a file (`DATA_DIR/tables.json`)
every 30 s and as it stops, and reads it back as it starts, with each
room's name, whether it is listed, and its lock (tables kept before rooms
had them come back unlisted, unlocked, named "Flies"). Room time is
each server process's own, so a device takes up the restarted room's clock
from its welcome. A table nobody has sat at for 30 days is forgotten; a
listed one after a day (it has long since dropped out of the list, which
shows only rooms with a fly there).

## The limits

Each device is the authority on its own fly, and nothing can stop a device
faking it. The room keeps the fake within what a fly could do, so that it
can't spoil the others' screens or their food (`packages/net/src/limits.ts`):

- **Moves.** A fly is never taken where its device says if a fly couldn't
  have got there. Each state may move it as far as it could travel since the
  last: 60 mm/s on its feet, 1.5 m/s in the air, with a second of travel
  saved up for uneven sends. A move further than that is cut short, so the
  others see the fly come only as far as it could have, and never jump. (The
  spike took a fly where it said after ten refusals in a row, which let a
  stalled or lying device's fly leap across everyone's screen; that is gone.)
  A state from somewhere a fly can't be (inside anything, under the floor,
  standing on nothing) leaves the fly where it was. Over each point it
  stands on whatever is under it there, the floor beneath a table or the
  table. A state from
  the future or older than the last is dropped.
- **Food.** Only under your own name, only on the table. A bite counts only
  within 4 mm of the food's edge of where the room has the fly, at the
  food's height (not from the floor under its table), and no faster
  than a fly eats (with a second's appetite saved up). Two flies at one sugar
  never eat more than there was.
- **Hands.** One ball in the air at a time per player (a new one replaces
  it), at most 12 throws a minute (3 at once), 30 drops (6 at once), 10 found
  foods, 120 bubbles burst, and 30 of the starter's changes.
- **Messages.** At most 60 a second from a device (120 at once); more are
  dropped. A message is at most 4 KB, and a device has 10 s to say hello.
  At most 24 connections from one address, and 30 rooms started from one an
  hour (5 at once). At most 8 flies a table; a seat gone more than 10 minutes is given
  up to a newcomer, never the starter's. What an address has done is kept
  for an hour after its last connection closes, so closing and opening
  again doesn't start its counts afresh.

### Rooms, names and passwords

A room's name is shown to strangers, so it is kept plain
(`roomName`, `packages/net/src/limits.ts`): up to 24 characters, made
canonical (NFC), every run of spaces one space, trimmed; only letters (any
script), their marks, digits, spaces and a little punctuation (`' ’ ! ? . ,
& : # ( ) + - _`). No control or invisible characters, which could reorder
or hide text, no symbols, no emoji. It is drawn as plain text on the
canvas, never as markup. Names aren't filtered for what they say: anything
more (a word list, reporting a room, the server's owner hiding one) is a
follow-up.

A password is up to 64 characters, none of them control characters. The
room keeps only a salted scrypt hash of it (`apps/server/src/lock.ts`:
16 random bytes of salt, N = 2^14, r = 8, p = 1), compared in constant time
and worked out off the event loop. It is never written to the file of
tables or the log, and it goes only over the room's socket (`wss` on the
site), in the hello, until the room has welcomed the device. A room's code
doesn't get round its lock: only the password does, or a key that has sat
there before (128 random bits each device keeps). Tries at a password are
counted where they come from and where they go: 5 at once then 3 a minute
from an address, and 10 at once then 6 a minute at a room, whoever tries;
a try past either is refused as busy, right or not. The list carries only
listed rooms: an unlisted one is never in it, nor told to anyone but by its
code.

The device's key is 128 random bits kept in its storage. The room keeps only
a hash of it. Table codes are invitations, so the log writes only a short
hash of each.

## Cost

Eight flies have to fit the frame on the slowest device, where the cost
follows draw calls and JavaScript (`AGENTS.md`). So another fly near the
camera is the real model, posed: two draws. One too far to show more than
about 9 pixels is a stand-in, all of them in one instanced draw and not
posed at all. Every other fly's shadow is one instanced draw, and what the
fly's eyes see of them (a 480-triangle stand-in each) is one more in each
face of the eyes. Nothing is made per frame for them. The other players'
hands share their textures. `apps/web/e2e/tables.e2e.ts` holds a table of
eight to the frame's budget on every screen shape.

## Running it locally

```sh
npm run rooms        # the room server on ws://localhost:8787/rooms
npm run dev          # the game; Vite proxies /rooms to it
```

Open the game, Online → New room → Create, and open the copied link in
another browser (or a private window: a device is its storage), or choose
the room from that browser's own list. `?rooms=ws://host:port/rooms`
points a page at another room server. `npm run rooms` keeps its tables only
in memory; set `DATA_DIR` to keep them across restarts.

| Environment | |
| --- | --- |
| `PORT` | where it listens (8787; 3000 in Docker) |
| `HOST` | the address it listens on (0.0.0.0) |
| `DATA_DIR` | where the tables are kept (none: in memory; `/data` in Docker) |
| `TRUST_PROXY` | 1 behind a proxy that sets `X-Forwarded-For`, for counting connections by address (set in Docker) |

`GET /health` answers `{ok, protocol, tables, devices, flies, browsing, uptime}`. The
log is one JSON object a line on stdout. In production the room server is
the `rooms` service of the Docker stack (`docs/deploy.md`).

Checks: `npm test` covers the protocol, the limits (names, passwords),
interpolation, the shared food, the table (presence, the away rule,
removal, the starter's choices, keeping tables across restarts), rooms
(the list, locks, guessing slowed, starting slowed, a listed room
forgotten) and the server over real sockets, and Online's screen and its
list's line. `npm run e2e` runs two headless tabs at a table: they see each other, share
food, rest while hidden, survive a server restart and a removal; then a
named, locked room is made from the menus with the keys and joined from
another tab's list, a wrong password first, and its link alone opens only
its door. It also
holds eight flies to the frame's budget on every screen shape, and checks
that single-player opens no connection. `npm run tables -- --clients 4 --seconds 120`
is a longer run with several tabs and fake flies, summing up what each saw.

## The Apple TV and the iPhone, later

The game reaches the room only through `TableSocket`
(`packages/contracts/src/socket.ts`): send, and once a frame drain what has
arrived. The browser's is a WebSocket (`apps/web/src/online/socket.ts`).

- **Apple TV (stage 2).** Its runtime has no `WebSocket`. Its host bridges
  one as `globalThis.__native.socket`, backed by `URLSessionWebSocketTask`
  on its own queue. JavaScript polls it each frame, copying each binary
  message into a preallocated buffer, so nothing is allocated per message.
  It needs `wss` (App Transport Security), an absolute room URL
  (`wss://flies.isaacthoman.com/rooms`), sharing a room (its code, or a QR
  code on the TV), a `TextEntry` bridged to tvOS's own keyboard as
  `globalThis.__native.keyboard` for names, codes and passwords, and
  measuring on the device with eight fake flies before promising eight.
  Online's screens already work with the remote alone.
- **iPhone and iPad (stage 3).** The same bridge, and the system share
  sheet. iOS suspends a backgrounded app, so away is the normal state there;
  the 10 minutes and coming back are what make it work.
