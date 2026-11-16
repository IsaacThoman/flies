# Flies together

Up to eight people's flies can share a table. Each fly's brain and body run
on its owner's device, exactly as they do alone. A small room server
(`apps/server`) runs no brains and draws nothing: it passes each fly's state
on to the others, and it owns the rest of the world there. That means the
place, the food, thrown balls, the light and the weather, and the seed and
clock the bubbles and visitors come from. Each fly sees the others with its
own eyes and meets them with its own body. Nothing else passes between flies.

This is the web's, for now. The Apple TV and the iPhone app join later
through a native WebSocket bridge (below).

## Playing

- **Starting a table.** The menu → Together → Start a table. The
  table is made in the place, light and weather the fly has now (a fly in
  the restaurant starts one at the picnic table), and Share
  the link opens the system's share sheet, or copies the link where there is
  none. The link is `https://<site>/?table=<code>`. Ten letters and digits
  (about 50 bits) are the only permission there is: anyone with the link can
  sit down.
- **Joining.** Opening the link sits this device's fly at the table, set
  down near the others. The device remembers its table: a reload, or opening
  the site again, comes back to it until it leaves.
- **Who is who.** No names and no chat. Each fly wears a dab of enamel on its
  thorax in its player's colour, as researchers mark flies. Other players'
  pointers show as rings in their colours. Your fly is the one the camera
  follows.
- **The starter** chooses the place (the Place tool carries the whole table
  there together, to any place but the restaurant: the wire's fly states
  carry where a fly is to ±655 mm, a table's size, not a room's), the light
  and the weather (their tools). Everyone else's
  Light, Weather and Place tools show the table's choice and refuse to change
  it. The starter can also take a fly off the table: Together lists the
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
- **Leaving.** Together → Leave the table. The fly stays where it is, alone,
  with the place's own food, and the light and weather its shelf had.

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

The four low bubbles that bob past each fly stay each device's own, so
nobody else sees yours.

## The wire

One WebSocket per device, at `wss://<site>/rooms`. The first message is the
device's `hello`, carrying the protocol version (now 1); the room refuses any
other. The fast traffic is binary and little-endian, with a type byte
first; everything rare is JSON (`packages/net/src/protocol.ts`,
`ClientMessage` and `ServerMessage`).

| Type | Direction | Layout | Bytes |
| --- | --- | --- | --- |
| 1 `FLY` | device to room, every 50 ms | type, state | 33, or 47 with the hand |
| 2 `FLIES` | room to device, every 50 ms when anything is new | type, count, then each fly's player id and state | 2 + 33 or 47 a fly |
| 3 `BITES` | device to room, at most every 100 ms | type, sequence (u16), count, then each food's id (u32) and amount (f32) | 4 + 8 a bite |

A fly's state (32 bytes, 46 with the hand):

| Field | Encoding |
| --- | --- |
| flags | u8: airborne 1, away (its device has stopped) 2, eating 4, hand out 8, holding Select 16, at the remote 32 |
| epoch | u8, the room's count of moves to another place: a state from before a move is dropped |
| sequence | u16, wrapping |
| time | u32, room ms when the fly was there |
| position | 3 × i16, 1/50 mm (±655 mm) |
| heading | u16, a turn in 65,536 |
| the ground's normal | 2 × i8, x and z (y follows) |
| velocity | 3 × i16, mm/s |
| pose | i8 speed (¼ body length/s), i8 turn (1/16 rad/s), u8 wings, groom, feed, crouch (1/255), i8 pitch (1/150 rad), i8 roll (1/200 rad) |
| the hand, if out | 3 × i16 pointer (1/20 mm), 3 × i16 camera (1/10 mm, for the way a puff blows), u8 tool, u8 kind |

JSON, from the device:

| Message | |
| --- | --- |
| `hello {v, table, key, start?, at?}` | the table's code; this device's key; `start` (place, light, weather, time zone and offset) to start the table if it doesn't exist; `at`, where its fly is, coming back after a moment away |
| `ping {t}` | answered `pong {t, now}` with the room's time |
| `drop {id, kind, x, z, at}` | food dropped, named by the device (player id × 1,000,000 + its count) so its fly can eat it before the room has heard |
| `ball {at, from, via, to}` | a throw, starting at room time `at` |
| `world {light, weather}`, `place {place}`, `remove {id}` | the starter's choices |
| `pop {slot, cycle, at}` | its fly burst a bubble |
| `found {id, name, x, z, r, sweet}` | the place put food out on this device, named from where it lies |
| `bye` | leaving for good |

From the room:

| Message | |
| --- | --- |
| `welcome {v, id, colour, starter, seed, now, wall, offset, place, epoch, world, players, foods, balls, happenings, bubbles, at}` | the table as it is, and where this fly stands; then a `FLIES` batch of every other fly where it is now |
| `refused {reason}` | then the connection closes with the matching code: version 4001, full 4002, removed 4003, unknown table 4004, busy 4005, malformed 4006, the same key sat down elsewhere 4007; 4010 after `bye` |
| `joined {id, colour, away}`, `away {id, away}`, `left {id}` | who is at the table, and whose device has stopped |
| `drop`, `ball`, `found`, `pop` | as above, to everyone else (`by` the player) |
| `world {light, weather, offset}`, `place {place, epoch, foods, spots}` | the starter's choices, to everyone; `spots` is where each fly is set down |
| `happening {kind, seed, at}` | a visitor comes |
| `food {ack, amounts, gone, eaten}` | at most ten times a second while food changes: what is left, what is gone, this player's total by the room's account, and the last of its bites counted |

### Coming back

A dropped line is opened again after 0.5, 1, 2, 4, 8, then 15 s, and at once
when the page is shown again. A deploy closes every connection with 1012;
devices come back within 0.3 to 1.5 s, spread out. The hello names the
device's key, and the room gives it back its seat: the same id and colour.
Its fly carries on where it is if that is within a walk of where the room
last had it (20 mm/s for up to 10 s); otherwise it is put back where the
room had it. The room keeps every table in a file (`DATA_DIR/tables.json`)
every 30 s and as it stops, and reads it back as it starts. Room time is
each server process's own, so a device takes up the restarted room's clock
from its welcome. A table nobody has sat at for 30 days is forgotten.

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
  A state from somewhere a fly can't be (inside what stands on the table,
  under it, standing on nothing) leaves the fly where it was. A state from
  the future or older than the last is dropped.
- **Food.** Only under your own name, only on the table. A bite counts only
  within 4 mm of the food's edge of where the room has the fly, and no faster
  than a fly eats (with a second's appetite saved up). Two flies at one sugar
  never eat more than there was.
- **Hands.** One ball in the air at a time per player (a new one replaces
  it), at most 12 throws a minute (3 at once), 30 drops (6 at once), 10 found
  foods, 120 bubbles burst, and 30 of the starter's changes.
- **Messages.** At most 60 a second from a device (120 at once); more are
  dropped. A message is at most 4 KB, and a device has 10 s to say hello.
  At most 24 connections from one address, and 30 tables started from one an
  hour. At most 8 flies a table; a seat gone more than 10 minutes is given
  up to a newcomer, never the starter's.

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

Open the game, Together → Start a table, and open the copied link in another
browser (or a private window: a device is its storage). `?rooms=ws://host:port/rooms`
points a page at another room server. `npm run rooms` keeps its tables only
in memory; set `DATA_DIR` to keep them across restarts.

| Environment | |
| --- | --- |
| `PORT` | where it listens (8787; 3000 in Docker) |
| `HOST` | the address it listens on (0.0.0.0) |
| `DATA_DIR` | where the tables are kept (none: in memory; `/data` in Docker) |
| `TRUST_PROXY` | 1 behind a proxy that sets `X-Forwarded-For`, for counting connections by address (set in Docker) |

`GET /health` answers `{ok, protocol, tables, devices, flies, uptime}`. The
log is one JSON object a line on stdout. In production the room server is
the `rooms` service of the Docker stack (`docs/deploy.md`).

Checks: `npm test` covers the protocol, the limits, interpolation, the
shared food, the table (presence, the away rule, removal, the starter's
choices, keeping tables across restarts) and the server over real sockets.
`npm run e2e` runs two headless tabs at a table: they see each other, share
food, rest while hidden, survive a server restart and a removal. It also
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
  (`wss://flies.isaacthoman.com/rooms`), a way to start, share (a code or a
  QR code on the TV) and leave a table with the remote, and measuring on the
  device with eight fake flies before promising eight.
- **iPhone and iPad (stage 3).** The same bridge, and the system share
  sheet. iOS suspends a backgrounded app, so away is the normal state there;
  the 10 minutes and coming back are what make it work.
