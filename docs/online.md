# Flies online

Up to eight flies can share a room (a table, in the code: the place the
flies share), with one to four from each device. Each fly's brain and body
run on its owner's device, exactly as they do alone. A small room server
(`apps/server`) runs no brains and draws nothing: it passes each fly's state
on to the others, and it owns the rest of the world there. That means the
place, the food, thrown balls, the light and weather in player-created rooms, and the seed and
clock the bubbles and visitors come from. Each fly sees the others with its
own eyes and meets them with its own body. Nothing else passes between flies.

Online play is shared by the web game, the Apple TV app with its native
WebSocket bridge, and the iPhone and iPad app with its web view's WebSocket
(below).

The storm/snow forecast uses wire protocol 5, retaining protocol 4 fly batches. A client on the older forecast
is refused with the existing version message instead of silently sharing a
table whose weather disagrees. The room server and clients must be updated
together; the binary fly-state layout itself is unchanged.

## Playing

- **Everyone.** Nobody has to do anything to be with others. Once the brain
  is awake, the game sits this device's flies in **Everyone**, a public room the
  room server keeps (below), unless Settings → Screensaver → Join others is off,
  the game was opened by a room's link (or code), it remembers a
  player-created room, or the device is offline.
  It is quiet about it: a room server that can't be reached, or one that
  turns the device away, leaves the fly playing alone as if nothing had been
  tried, with no note, and the game tries again in the background after 30 s,
  1, 2 and then every 5 minutes (at once when the network comes back). A try
  not let in within 10 s, or whose line fails once, is given up the same way.
  Unknown rooms, incompatible versions, removal and another window taking
  the same seat stop retries for that launch.
  Until it is let in, the fly eats its own food and Online shows the rooms
  as if it were alone. Leaving the room from Online or turning Join others off stops automatic
  joining until the next launch; choosing another room also stops it; turning
  Join others on again sits it with everyone soon.
- **The rooms open to everyone** (`EVERYONE_ROOMS`, `packages/net/src/protocol.ts`)
  are Everyone, Everyone 2, Everyone 3, …, up to 64, with the codes
  `2222222222`, `2222222223`, …. The server opens Everyone as it starts, and
  opens further rooms while searching for enough seats for an arriving
  group, even if an earlier room has some free seats. They are exempt from
  runtime expiry and eviction; restore capacity has a limit (Coming back).
  A hello for any of their codes is a hello for whichever has room: the one
  named, if this device's flies are still there (a dropped line, a reload),
  otherwise the first with a seat for every fly it brings, by flies, not
  devices (only if none has, the first with a seat for some of them, which
  it is given). So a full Everyone sends a newcomer on to Everyone 2, and
  its link leads to whichever has room; the 64 hold at most 512 flies. They
  have no password and no starter, so nobody chooses for anyone else,
  nobody can take a device off, and no seat is kept for anyone gone:
  - **The place** takes turns by the server's clock, 20 minutes in each
    (picnic, windowsill, lab, bar, restaurant, by the wall clock, so every
    restart agrees), and carries everyone there together. The Place tool
    shows it and refuses to change it, and Settings → Screensaver → Where it
    lives waits until the fly is alone again: neither fights the room.
  - **The light and the weather** are each device's own, as alone: "Now" is
    its own clock and sky (on an Apple TV, the weather outside), and the
    Light and Weather tools change only what this device sees, and are kept
    as alone. What the room shares doesn't depend on them: its visitors come
    by its own pace, and each device lets pass any its own sky doesn't suit
    (no butterfly in its rain, no gull in its night); the shared bubbles
    don't burst in anyone's rain.
  - Online, in one of them, shows its name, its QR code and code, and Share
    the link, Other rooms and Leave the room. Other rooms is the list, with
    the fly still in the room until another is chosen (or Back).
- **The rooms.** The menu → Online lists the rooms open to everyone first
  (Everyone always, the others while someone is there), each with a globe,
  then other public rooms with someone in them, fullest first (at most 50 rooms in all): its name, its place's colour, its eight seats as pips
  (one per present or still-connected fly, plus a departed starter's reserved first seat)
  and a padlock if it has a password. The list follows the room server as
  rooms open, fill and empty. A full one can't be chosen, but for a room
  open to everyone, which sends whoever chooses it on to the next. Above the list are
  New room, and Code, for an unlisted room's code (the ten letters and digits of its
  link).
- **A new room.** New room → its name (two words are suggested, to keep or
  type over), its place (the fly's own to start with), Public or Unlisted
  and a password (none, unless one is typed). Create sits this device's
  flies there, under its light and weather. Share the link opens the system's
  share sheet, or copies the link where there is none. At the site root the link is
  `https://<site>/?table=<code>`; browsers keep their current path and scheme. Ten letters and digits (about 50 bits):
  for an unlisted room without a password, they are the only permission
  there is.
- **A locked room.** Choosing one from the list, or opening its link or
  code, comes to its door: its password, then Join. With a remote or the
  keys in hand the password is typed at once; with a finger, a tap on it.
  A wrong one says so where the room's name was, in pink, and the password
  is typed again. A device whose seat is still kept comes back to it
  (a dropped line, a reload) without it; the server also exempts its starter. Choosing a locked list
  entry still opens the password form before asking the server.
- **Joining.** Choosing an open room, typing its code, or opening its link sits this device's flies at the room, set
  down around the place's start, at its height (in the
  restaurant, on the window table, not the floor under it). The device remembers its table: a reload, or opening
  the site again, comes back to it until it leaves. Settings → Screensaver →
  Flies chooses how many, one to four (three on an Apple TV). The table seats
  as many as there is room for, at least one, or refuses it as full. Changing
  the setting while seated retries briefly (see the `flies` message below); a seat freed
  later doesn't add a fly by itself. Coming back asks again too.
- **Who is who.** No names and no chat. Each fly wears a dab of enamel on its
  thorax in its own colour, given by its id, as researchers mark flies. Other players'
  pointers show as rings in their first fly's colour. Your first fly is the
  one the camera follows: the pointer drifts back to it, and the eyes'
  picture, nervous system, stats, X-ray, activity and day's tally are its.
- **The starter** (of a room someone made) chooses the place (the Place tool carries the whole table
  there together), the light and the weather (their tools). Everyone else's
  Light, Weather and Place tools show the table's choice and refuse to change
  it. The starter can also take a device off the table: Online lists the
  others by their flies' colours, several dots for several flies, each with
  Remove. All that device's flies go. Its key is barred while among the last
  256 removed; clearing device storage creates another key.
- **The table's clock** is the starter's. Their time zone goes with the
  table when it is started, so "Now" on the Light tool is their time of day.
  "Now" on the Weather tool is the made-up forecast from that clock, so
  everyone sees the same rain. The real weather outside (WeatherKit) isn't
  used at a player-created table. Everyone keeps each device's own sky.
- **Tools on other flies.** In public and unlisted rooms, everyone's tools
  reach everyone's flies through the world. A ball thrown is seen coming by
  every fly, a feather or a puff is felt by whichever fly it touches, and
  food dropped is food for all. This follows rule 1: other players act on
  your fly only through its senses.
- **Away.** A hidden tab, a sleeping phone or a dropped connection leaves the
  device's flies at the table, resting together: wings folded, still, their
  near models dimmed. After 10 minutes away they leave; when the device comes
  back, retained seats keep their colours and positions are checked (Coming back).
- **Leaving.** Online → Leave the room. The flies stay where they are, alone,
  with the place's own food, and the light and weather its shelf had.
- **What goes wrong** is said in the heading's place, in a few words: a
  wrong password, too many tries, a full room, one that has closed, being
  taken off one.

Discovery gives a connection or first list 10 seconds before saying it
cannot reach rooms. It retries automatically. A quiet list is checked by
reopening its line after 30 seconds; if that gets no answer within 10
seconds, the retained list is marked reconnecting and cannot be chosen.
A fresh list clears the failure. A protocol mismatch says “Update needed”;
installed apps need an app update and never reload their bundled game.
Browsers try an immediate reload for each protocol; further attempts use
backoff while Online discovery is active (The wire). Automatic Everyone
joining stops on version refusal for that launch. Back from a door or new-room form returns
to the list; Back from Other rooms returns to the Everyone room. Back from
the main Online view closes the menu without leaving an existing room.

### Typing

Names, passwords and codes are typed into fields the game draws. In a
browser the keys go to one `<input>` that is never seen
(`apps/web/src/ui/text-entry.ts`), focused while a field is being typed
into, so a physical keyboard, a phone's or a tablet's own keyboard, input
methods, paste and password managers can use it: a password field is a
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

Solo play has no other players' bodies or room connection, except while
Online browses or the game tries to join Everyone. Join others off and
`?alone` disable automatic Everyone joining; neither blocks an invitation
or a remembered player-created room. Leave that room and remove any
`?table=` invitation for a solo launch. `npm run tvos:check` uses `?alone`
with controlled test settings. The device's own flies still live together, each with its own brain, senses and
eyes, all eating from one pantry (`apps/web/src/company.ts`). A companion whose
brain fails gets a replacement after a 5 s wait; if that fails, another
after a 30 s wait; if that fails too it is taken off; at a table the device then asks for one fewer. Alone with
several, the followed fly wears yellow enamel and the others the next
colours; a lone fly wears none.

## Who owns what

| | Owner | How the others get it |
| --- | --- | --- |
| A fly: where it is, its pose | Its player's device, where its brain and body run | About 20 states a second through the room, in one batch of the device's flies, drawn 100–600 ms in the past with adaptive interpolation (`packages/net/src/track.ts`); only its first fly carries the player's hand |
| What a fly feels and does about the others | Its own device | The others are bodies its eyes see and its body meets (`packages/body/src/crowd.ts`); their hands are the same `Hands` as yours, driven from the wire (`apps/web/src/online/other-hands.ts`) |
| The food: the place's patches, what is dropped, what the place puts out | The room (`TableFood`) | Each device eats at once and tells the room; the room's account, less what the device has eaten since, is what is left (`FoodMirror`) |
| A thrown ball | The room's clock | Its path and the moment its dive starts: every device (and the room) puts it in the same place at the same moment (`packages/net/src/ball.ts`), after a lead of 1.5 times the estimated round trip, clamped to 200–600 ms |
| The place | The room | `place` tells every device to carry its flies there, and where each fly is set down |
| The light, the weather, the clock | The room, chosen by the starter; in a room open to everyone, each device | `world` and the welcome's clock; "Now" follows the starter's time zone. In a room open to everyone the room says "clock" and "now" and nobody listens: each device keeps its own |
| The high bubbles | The room's seed and clock | Each device works them out (`packages/net/src/bubbles.ts`); when any of its flies bursts one, it says so |
| Visitors (gust, gull, leaf, butterfly, ladybird, juice, boat) | The room says when, with a seed (the picnic's pace, `@fly/world`) | Each device starts the visit from that seed (`SceneSet.happen`); butterflies and ladybirds keep clear of whichever fly is nearest, this device's and everyone else's |
| The restaurant's ventilation | The room says when it comes on, by the same clock as alone (`VentilationClock`, `@fly/world`), with a seed | Each device draws how long it runs from the seed (`SceneSet.happen`), sharing its duration; local processing time and eddy phase can differ |

The four low bubbles that bob past the followed fly stay each device's own, so
nobody else sees yours.

## The wire

One WebSocket for the room, plus a discovery socket while Online browses
(including from Everyone), at `wss://<site>/rooms`. The first room message is the
device's `hello`, carrying the protocol version (now 5); the room refuses any
other. Installed apps need an app update. A browser refused for its version
tries the site's current game: immediately, the first time for each protocol it speaks
(when it receives a version refusal), and if the
reload brought the same page back (the network too slow, and the service
worker's kept page shown), later calls are eligible after 30 s, doubling
to 30 minutes. Online discovery keeps making those calls; a failed automatic
Everyone attempt stops for that launch. Reload also requires working
session storage. The backoff avoids reload requests every frame; success
still depends on reaching the current build (`apps/web/src/online/newer.ts`). A connection that only lists the rooms says `browse`
instead, and is told `rooms` at once and again whenever the list changes
(checked every 2 s); nothing else it says is listened to. The fast traffic is binary and little-endian, with a type byte
first; everything rare is JSON (`packages/net/src/protocol.ts`,
`ClientMessage` and `ServerMessage`).

| Type | Direction | Layout | Bytes |
| --- | --- | --- | --- |
| 1 `FLY` | device to room, nominally every 50 ms | type, count, then each fly's id and state; only the first carries the hand | 2 + 33 a fly, + 14 with the hand |
| 2 `FLIES` | room to device, nominally every 50 ms when anything is new | type, count, then each fly's id and state | 2 + 33 a fly, + 14 for each hand |
| 3 `BITES` | device to room, at most every 100 ms | type, sequence (u16), count, then each food's id (u32) and amount (f32), then the epoch (u8) of the place they were taken in | 5 + 8 a bite |

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

Protocol 5 adds shared seasonal weather and precipitation phases to
protocol 4. Protocol 4 introduced several flies from one device: the seats
count flies, each with its own id and colour, and `FLY` is a batch like
`FLIES`. It also carries what came to 3 without a new number, which a
device speaking 4 always sends: the epoch on a drop, a ball, a burst
bubble, found food and bites, and `clearFood`. A device speaking 3 sends one state without its id, so it is
turned away; a browser tries the current game.

The rooms open to everyone came within protocol 3, adding fields only
(`room.code` and `room.everyone` in the welcome, `everyone` in the list),
and protocol 4 carries them as they are. A current device and a room server
speaking protocol 5 but without Everyone: its hello is refused as unknown, and it stays
alone, quietly, without trying again that launch.

Protocol 3 is protocol 2 with rooms: names, the list, and passwords. A
device speaking 2 doesn't know a room can be locked, and would knock at a
locked door forever, so it is turned away; browsers try to reload the current game.

Protocol 2 is protocol 1 with each place's own scale. A tabletop's states
are the same bytes as before, but the room is a place protocol 1 can't
read: a device that doesn't know the restaurant would read its states at a
tabletop's scale, clamped and wrong, and can't be carried there. So the
version changed, and a device speaking 1 is turned away (browsers try the current game)
rather than sitting at a table that may move to the restaurant.

| Field | Encoding |
| --- | --- |
| flags | u8: airborne 1, away (its device has stopped) 2, eating 4, hand out 8, holding Select 16, at the remote 32 |
| epoch | u8, the room's count of moves to another place: a state from before a move is dropped |
| sequence | u16, wrapping |
| time | u32, room ms when the fly was there, modulo 2^32 (it wraps after about 49.7 days of a room server's uptime): each end reads it as the room time nearest its own (`roomTime`) |
| position | 3 × i16, at the place's scale |
| heading | u16, a turn in 65,536 |
| the ground's normal | 2 × i8, x and z (y follows) |
| velocity | 3 × i16, mm/s |
| pose | i8 speed (¼ body length/s), i8 turn (1/16 rad/s), u8 wings, groom, feed, crouch (1/255), i8 pitch (1/150 rad), i8 roll (1/200 rad) |
| the hand, if out | 3 × i16 pointer, 3 × i16 camera (for the way a puff blows), each at the place's scale, u8 tool, u8 kind |

JSON, from the device:

| Message | |
| --- | --- |
| `hello {v, table, key, start?, password?, flies?, at?, epoch?}` | the table's code (for a room open to everyone, the one wanted: `start` and `password` are ignored, and the device is seated wherever there is room for its flies); this device's key; `start` (place, light, weather, time zone and offset, and the room's `name` and whether it is `listed`) to start the table if it doesn't exist; `password`, the lock a new room is to have, or the key to a locked one, sent only until welcomed; `flies`, how many it asks for (1 to 4, 1 if left out); `at`, an array of each fly's spot in seated order, coming back after a moment away, and the `epoch` of their place |
| `browse {v}` | instead of a hello: this connection only lists the rooms |
| `ping {t}` | answered `pong {t, now}` with the room's time |
| `drop {id, kind, x, z, y, at, epoch}` | food dropped onto the surface at or below `y` (the floor under a table, or the table), named by the device (player id × 1,000,000 + its count) so its flies can eat it before the room has heard |
| `clearFood {epoch}` | clears only this player’s dropped offerings in the current place; the room sends their ids in `food.gone` |
| `ball {at, from, via, to, epoch}` | a throw, starting at room time `at` |
| `world {light, weather}`, `place {place}`, `remove {id}` | the starter's choices; `remove` takes any fly's id and removes its whole device |
| `flies {count}` | how many flies this device now asks for, answered by `seated`; one at a time, and one unanswered (dropped for coming too often) is asked again after 1, 2, 4 and 8 s, then left until the count changes or the line comes back |
| `pop {slot, cycle, at, epoch}` | one of its flies burst a bubble |
| `found {id, name, x, z, y, r, sweet, lasts?, epoch}` | the place put food out on this device, named from where it lies; optional `lasts` is remaining seconds (Found-food lifetime) |
| `bye` | leaving for good |

What a device does in its place (bites, a drop, a throw, a burst bubble,
found food) names the epoch of the place it was done in, as its fly's
states do: one in flight as the starter moves the table is dropped, not
done in the place the table has gone to, where the same food ids and
coordinates are something else. The epoch is an addition: a room from
before reads the bites before it and ignores the field, and a device from
before sends none, which the room takes wherever the table is.

From the room:

| Message | |
| --- | --- |
| `welcome {v, id, colour, flies, starter, seed, now, wall, offset, place, epoch, world, players, meals?, foods, balls, happenings, bubbles, at, room}` | the table as it is, this device's `flies` as `{id, colour, at}` each, and the room's `{name, listed, locked, code, everyone}` (`code`: the room it is, which for a room open to everyone may not be the one asked for; `starter` 0 there); `id`, `colour` and `at` are the first fly's, its id also the player's; `players` is every other device's flies as `{id, colour, away, of}`, where `of` is its device's first fly's id; optional `meals` advertises nutrition receipts (Bite acknowledgements); then a `FLIES` batch of those other flies where they are now |
| `refused {reason, name?}` | initial refusals send this message then close with the matching code: version 4001, full 4002, removed 4003, unknown table 4004, busy 4005 (too many rooms started, or passwords tried), malformed 4006, the same key sat down elsewhere 4007 (close only, no preceding refusal), locked 4008 (no password, or the wrong one: with the room's `name`, for its door); 4010 after `bye` |
| `rooms {rooms}` | to a browsing connection: the rooms open to everyone (Everyone always, the others with a fly there), then each listed room with a fly there, fullest first, at most 50 in all, as `{code, name, place, flies, locked, everyone?}`; `flies` counts unavailable seats: present or still-connected flies, plus a departed starter's reserved first seat |
| `joined {id, colour, away, of}`, `away {id, away}`, `left {id}` | one message per fly coming, resting or leaving; `of` is whose it is, the id of its device's first fly |
| `pong {t, now}` | echoes the ping timestamp and supplies current room time |
| `seated {flies, asked}` | this device's flies after a count change, each as `{id, colour, at}`, and the count it answers |
| `drop`, `ball` | as above, to everyone else, with `by` the player; a drop's `y` is the surface it lands on |
| `found {food}`, `pop {slot, cycle, at}` | a `FoodWire` tuple or bubble burst; neither carries `by` |
| `world {light, weather, offset}`, `place {place, epoch, foods, spots, bubbles?}` | the starter's choices, to everyone; `spots` is where each fly is set down, and `bubbles` the picnic's bubbles as they stand (a room server from before them says none, and a device starts them at 0) |
| `happening {kind, seed, at}` | a visitor comes |
| `food {ack, amounts, gone, eaten, meal?}` | normally on 100 ms ticks while food changes, with additional flushes before found-food reports: what is left, what is gone, this device's flies' total by the room's account, and the last of its bites counted; `meal`, what they were granted since (amount, sugar), shared among its flies by how long each was eating |

A spot (`at`, `spots`) is x, z, yaw and the height of the surface the fly
stands on, and each of `foods` carries the height it lies at: in the
restaurant one point can be the floor, a chair seat or the table over them.

### Coming back

A dropped line retries at nominal delays of 0.5, 1, 2, 4, 8, then 15 s,
randomized by ±20%, and at once
when the page is shown again. A deploy closes every connection with 1012;
devices schedule a retry after 0.3 to 1.5 s; reconnecting takes longer. The hello names the
device's key, and the room gives it back its flies: the same ids and colours,
unless their seats have been given up. Each carries on where it is if that
is in the place the table is in (the hello's epoch) and within a straight-line distance of
where the room last had it (20 mm/s for up to 10 s, plus 3 mm), on a surface
with 2 mm clearance above it; otherwise it is put back where the room had it. The check requires no matching surface or walkable path. With `DATA_DIR` set,
the room keeps every table in a file (`DATA_DIR/tables.json`) every 30 s and as it stops,
and reads it back as it starts, with each
room's name, whether it is listed, and its lock (tables kept before rooms
had them come back unlisted, unlocked, named "Flies"). Each device's seat
keeps its flies in `seats[].flies`; older records with one fly per seat
still load. A room open to everyone comes back in the place the clock has
it now: if that is another, its epoch moves on, its kept food is dropped
and its flies are set down there afresh. Room time is each server process's own, so a device takes up the restarted room's clock
from its welcome. A table nobody has sat at for 30 days is forgotten; a
listed one after a day (it has long since dropped out of the list, which
shows only rooms with a fly there). Everyone rooms are exempt from runtime expiry and eviction. Restore stops
at 10,000 records, so Everyone rooms opened beyond that threshold can lose
their saved state on restart and be recreated empty.

## The limits

Each device is the authority on its own flies, and nothing can stop a device
faking it. The room bounds positions, rates and food use to limit disruption (`packages/net/src/limits.ts`):

- **Moves.** Each state has a travel allowance: 60 mm/s on its feet,
  1.5 m/s in the air, with a second of travel saved for uneven sends and
  0.5 mm slack per state. Longer moves are shortened. Surface checks allow
  1.5 mm sinking and 3 mm off the surface on foot; they do not prove a
  walkable path. States over 500 ms ahead of room time, or no newer than
  the last state, are dropped.
- **Food.** Dropped offerings can be cleared only by their owner; patches and finds stay. Clear requests share the drop rate limit and must name the current place’s epoch. Only under your own name, only on the table. One account per device. A bite counts only within 4 mm of the
  food's edge of where the room has any of its flies, within 5.5 mm of its height,
  with appetite replenishing at 1.5 times the solo eating rate per seated fly (with a second's appetite saved up). Two flies at one sugar never eat
  more than there was (`TableFood.bite`, `packages/net/src/food.ts`).
- **Hands.** One ball in the air at a time per player (a new one replaces
  it). Token buckets replenish per minute at 12 throws (burst 3), 30 drops
  (burst 6), 10 found-food reports (burst 4), 120 bubble bursts (burst 10),
  30 starter changes including removals (burst 6), and 20 changes to a
  device's fly count (burst 6), an allowance of
  its own so that a starter busy with the light never has a recount
  dropped. One past it goes unanswered; the device retries within its bounded recount policy. At most
  6 dropped foods and 16 found ones lie at a table at once; past either,
  the oldest goes.
- **Messages.** Message tokens replenish at 60 a second per device (burst 120); more are
  dropped. A message is at most 4 KB, and a device has 10 s to say hello.
  A device's `FLY` is read whole before any of it is used: one cut short,
  with more than 4 flies, or with a fly twice is dropped; a state in it for
  a fly that isn't the device's is left out.
  At most 64 connections open from one address (a house, a school or a
  phone network behind one address, now that every device sits with
  everyone by default). Opening tokens replenish at 60 a minute (burst 30),
  and room starts at 30 an hour (burst 5; the rooms open to everyone aren't
  counted: nobody starts them). At most 8 flies a table (`MAX_FLIES`), 4 per device
  (`MAX_OWN`). A new device gets as many as it asks for or there are free seats,
  whichever is fewer; with none free it is refused as full. Reducing the
  count takes the last flies off first. A disconnected device no longer
  present (after 10 minutes away, or immediately after Leave) gives up all its seats together to make room. A starter who has gone
  gives up all but their first fly's, and only once nobody else's are left
  to give: the table keeps their place and its colour, and counts it as
  taken in the list, so a room never shows a seat free that it can't give.
  Coming back, they get as many as are free then. A room open to everyone
  has no starter, so it keeps no seat for anyone gone. What an
  address has done is kept for an hour after its last connection closes,
  unless the 50,000-address cap forces earlier eviction of idle entries.
  Reopening normally retains counts; eviction can reset them.

### Rooms, names and passwords

A room's name is shown to strangers, so it is kept plain
(`roomName`, `packages/net/src/limits.ts`): up to 24 characters, made
canonical (NFC), every run of spaces one space, trimmed; only letters (any
script), their marks, Unicode numbers, spaces and a little punctuation (`' ’ ! ? . ,
& : # ( ) + - _`). After whitespace normalization, control and default-ignorable characters
are rejected, along with symbols and emoji. It is drawn as plain text on the
canvas, never as markup. Names aren't filtered for what they say: anything
more (a word list, reporting a room, the server's owner hiding one) is a
follow-up. Nor may a name hold a letter that draws nothing (the Hangul
fillers, and every other default-ignorable character), to reduce empty-looking or hidden names. Runs of four combining marks
are rejected to limit marks piling up over the rows round it. The game checks the names in the
list the same way, so one the room server let through is left out.

A password is up to 64 Unicode code points, excluding category C
(control, format, surrogate, private-use and unassigned characters). The
room keeps only a salted scrypt hash of it (`apps/server/src/lock.ts`:
16 random bytes of salt, N = 2^14, r = 8, p = 1), compared in constant time
and worked out off the event loop. It is never written to the file of
tables or the log, and it goes only over the room's socket (`wss` on the
site), in the hello, until the room has welcomed the device. A room's code
doesn't get round its lock: only the password does, or the starter's key or a key whose seat is still kept (128 random bits each device keeps). Tries at a password are
counted where they come from and where they go: 5 at once then 3 a minute
from an address, and 10 at once then 6 a minute at a room, whoever tries;
a try past either is refused as busy, right or not. The list carries only
listed rooms: an unlisted one is never in it, nor told to anyone but by its
code.

The device's key is 128 random bits kept in its storage. The room keeps only
a hash of it. Table codes are invitations, so the log writes only a short
hash of each.

## Security

The room server is on the open internet, and anyone can write their own
client. This is what it holds to, whatever a device sends, and where.

- **Who may do what.** Every message is checked by the room, never trusted
  from the device that sent it (`apps/server/src/table.ts`). A device acts
  only as the seat its key sat it in: its own fly, its own drops (food
  named under its own id), its own bites, its own ball, its own goodbye.
  Only the starter's key moves the table, changes its light and weather,
  or removes a player, and never its own seat. A bubble bursts only if it
  was there then; found food only on the table and in bounds. Keys are 128
  random bits a device keeps and sends only to the room, which stores them
  hashed. Anyone who obtains the key can use that identity; it is not bound
  to the physical device.
- **Locked and unlisted rooms.** Only the password opens a locked room, or a
  starter's key or a key whose seat is still kept (above). An unlisted room is never in the
  list or told to anyone but by its code, and the server answers no
  question that would tell whether a code is a room without trying to sit
  at it. About 50 bits of code and an opening rate of 60 a minute per
  address (burst 30) make random guessing unlikely, not impossible.
- **Addresses.** The per-address limits count the visitor, not the proxy:
  with `TRUST_PROXY=1`, `X-Forwarded-For` is believed only when the
  connection itself comes from a loopback, private, link-local or shared-address-space peer (the proxy in
  front, `docs/deploy.md`), and then only its last valid address, the one the
  proxy should have added; anyone reaching the server directly is counted by their own
  address, whatever they write. An IPv4 address seen as IPv6 is the IPv4
  address, and IPv6 ones count by their /64, since one machine has a whole
  /64 to pick from.
- **Bounds.** Nothing a client does grows the server without bound
  (`apps/server/src/server.ts`): 4 KB a message, uncompressed; message tokens replenishing at 60
  a second per device (burst 120); 10 s to say hello; a ping every 15 s, a
  connection that didn't answer the last one dropped; a request's headers
  within 10 s and 8 KB; 4096 sockets at once in all and 64 from an
  address; a device that has 256 KB it hasn't taken is dropped rather than
  its backlog kept; 8 passwords worked out at once (about 16 MB each, off
  the event loop), a try past that refused as busy; ordinary room creation
  checks a 10,000-table threshold, but lazy Everyone creation can add up to
  63 beyond it. At the threshold, the unoccupied non-Everyone room unused longest is forgotten,
  or creation is refused as busy if none is eligible; 50,000 addresses remembered. A table holds at most 8
  flies (4 a device), 8 balls, 16 happenings, 6 dropped and 16 found foods besides the
  place's own, and 256 removed keys. A table with nobody at it does no
  work each beat, and its bubbles start afresh when someone comes (as on
  a table started, or carried to the picnic), never replaying all the
  time the server has been up. A message the table can't take costs its
  sender the line (4006), never the server.
- **The file of tables.** Written whole to a new file, flushed to the disk,
  then renamed over the old one to avoid a partial replacement. The directory
  is not fsynced, so this does not guarantee recovery from every power failure. Read back, each table is checked field by field
  against what the server writes (`isTableRecord`: each seat's flies, 1 to
  4, under ids no other fly there has, or a single fly kept before devices
  had several); one that doesn't fit is
  left out and logged, and a readable file with invalid JSON or top-level schema is moved aside
  as `tables.json.unreadable-<time>`. A read I/O error returns no saved tables
  without moving the file; a failed move-aside can prevent startup.
- **Logs and secrets.** Passwords are kept only as salted scrypt hashes,
  keys only as hashes, and neither is ever logged; a table's code, which is
  its invitation, is logged only as a short hash of it.
- **The game's side.** JSON messages are checked by `readServerMessage`
  (`packages/net/src/wire.ts`) for required fields, types, finite numbers
  and bounded lists. The bounds allow 96 foods and 64 happenings, rather
  than each place's exact capacity. Own seated flies must number 1 to 4,
  each id once. Invalid JSON messages are dropped; room lists instead filter
  invalid entries. Binary fly batches are decoded separately and can apply
  early states before detecting later truncation; rejection is not atomic.
  A browser's line drops itself rather than queue more than 256 messages or
  256 KB. The Apple TV host uses a 256 KB bound; its JavaScript adapter only
  delivers binary messages no longer than the largest fly batch.
- **Fuzzing.** `npm test` fuzzes the protocol for a moment from a fresh
  seed by default (`FUZZ_SEED` overrides it; `apps/server/tests/fuzz.test.ts`): a table in the process
  fed what a device might send, mostly in shape and often not, checked
  after each step against these bounds and against the game's reading of
  everything it sent; and a server on the loopback, over sockets, that
  must stay up, log no error and still seat a device afterwards.
  `npm run fuzz:rooms -- --seconds 600` runs it for longer, seed after
  seed; `--seed` replays one.

Not covered: what names say (above), and a botnet's worth of addresses,
which no per-address limit stops; that is the proxy's and the host's to
meet (`docs/deploy.md`).

## Cost

Eight flies have to fit the frame on the slowest device, where the cost
follows draw calls and JavaScript (`AGENTS.md`). Every fly but the followed
one is drawn by `OtherFlies` (`apps/web/src/online/others.ts`), whether its
brain runs here or on another device. Near the camera it is the real model,
posed: two draws. One too far to show more than about 9 pixels is a stand-in,
all of them in one instanced draw and not posed at all. Their shadows are
one instanced draw, and what each fly's eyes see of all the others (a
480-triangle stand-in each) is one more in each face of the eyes. Its own
stand-in is left out while it looks round. Geometry, matrices and crowd objects are reused; this is no guarantee
of zero allocations throughout the online path. The other players' hands share their textures.
`apps/web/e2e/tables.e2e.ts` checks draw and triangle caps with one real fly and
seven synthetic peers on its enumerated screen shapes; it does not measure TV frame time.

One device runs at most four. Each brain runs off the JavaScript
thread: a Web Worker in a browser, its own native thread on the TV. Retained estimates put each native brain at about 58 MB and 13 to 45%
of an A15 performance core; a WebAssembly worker at about 95 MB
(`packages/brain-native/README.md`). Their capture dates and exact builds
are unknown.
The workers load one after another from the same kept connectome
(`InTurn`, `apps/web/src/brain/create.ts`), so nothing downloads twice at once.
An Apple TV lives at most three; an older Apple TV host without `brain.spawn`
runs only one fly and has no Flies setting.

Their eyes take turns, at most one refresh per frame, choosing the most
overdue eligible fly. Pending GPU reads and reflection work can defer them;
with four at 60 fps, 15 refreshes per second each is an ideal maximum under
even scheduling. A ball approaching gives the followed fly priority, capped
at 60 Hz, rather than guaranteeing a refresh every frame. Four flies'
meeting, senses, bodies, poses and nearby models were reported at 19 M5 Pro
CPU µs a frame in Node 26, with a 34 µs budget in
`apps/web/tests/company.budget.ts`. Measured on an Apple TV 4K on 16 November
2026, JavaScript a frame went from 3.8 ms with one fly to 7.9–9.3 ms with
four, 13.6 ms at a full table; draws a frame from 38 to about 77 at the
picnic; and four kept the screensaver below 60 fps where one and three hold
it, so a TV lives three (`docs/apple-tv.md`, "Several flies on peev").

## Running it locally

```sh
npm run rooms        # the room server on ws://localhost:8787/rooms
npm run dev          # the game; Vite proxies /rooms to it
```

Open the game and it sits in Everyone once awake; open it in another
browser (or a private window: a device is its storage) and the two flies are
together. Or Online → New room → Create, and open the copied link in
another browser (or a private window: a device is its storage), or choose
the room from that browser's own list. `?rooms=ws://host:port/rooms`
points a page at another room server. Shared links drop that override;
add it again in the receiving browser when using a custom server. `npm run rooms` keeps its tables only
in memory; set `DATA_DIR` to keep them across restarts.

| Environment | |
| --- | --- |
| `PORT` | where it listens (8787; 3000 in Docker) |
| `HOST` | the address it listens on (0.0.0.0) |
| `DATA_DIR` | where the tables are kept (none: in memory; `/data` in Docker) |
| `TRUST_PROXY` | 1 behind a proxy that sets `X-Forwarded-For`, for counting connections by address (set in Docker); believed only from a loopback, private, link-local or shared-address-space peer |

`GET /health` answers `{ok, protocol, tables, devices, flies, browsing, uptime}`. The
log is one JSON object a line: info on stdout, warnings and errors on stderr. In production the room server is
the `rooms` service of the Docker stack (`docs/deploy.md`).

The rooms open to everyone hold at most 64 × 8 = 512 flies on one server.
A device with one fly sends about 1 KB/s up and receives 7 KB/s down in
full-room binary state payload (excluding framing and other traffic), so a server whose
rooms fill should be watched (`/health`'s `devices` and `flies`); a device
automatically joining Everyone retries later if refused as full.

Checks: `npm test` covers the protocol, the limits (names, passwords),
interpolation, the shared food, the table (presence, the away rule,
removal, the starter's choices, keeping tables across restarts), rooms
(the list, locks, guessing slowed, starting slowed, a listed room
forgotten), the rooms open to everyone (the first always there, the next
opened to fit arriving groups, by flies, a returning device back in its own, nobody's to choose
for, exempt from runtime expiry, the place by the clock, persisted below
the restore cap) and the
server over real sockets, what hostile devices send
(`apps/server/tests/hardening.test.ts`, and the fuzzing above), Online's
screen and its list's line, `Online` itself (the flies the table seats it,
bounded recount retries, where its flies stand coming back, and never
taking its own flies for another player's), and sitting with everyone by default
(`AutoJoin`: only once awake, enabled and online, quiet when it can't, no
rejoining after leaving). `npm run e2e` runs two headless tabs at a table: they see each other, share
food, rest while hidden, survive a server restart and a removal; then a
named, locked room is made from the menus with the keys and joined from
another tab's list, a wrong password first, and its link alone opens only
its door; two tabs that just open the game find each other in Everyone, one
leaves it from Online and stays alone, and a tab whose room server can't be
reached plays alone without a word. It also
checks eight flies against draw and triangle caps on its enumerated screen shapes, and checks
that with Join others off single-player opens no connection. Suites using `holdSteady`
with its default options disable Join others and the screensaver
(`scripts/play.ts`). The first-minute suite instead checks automatic
Everyone joining; the accessibility suite has its own room fixture. `npm run tables -- --clients 4 --seconds 120`
runs four real-brain tabs for 120 seconds, summing up what each saw. Add
`--fake 4` for four synthetic peers.

For scripts, the canvas's `data-flies` counts this device's flies and
`data-crowd` counts the followed fly's neighbours. `data-company` lists each
other local fly as `id:brain:activity:x,z:eyeUpdates:crowd:colour`, separated
by semicolons (id 0 alone). At a table, `data-mine` lists its seated flies as
`id:colour`, `data-asked` is how many it asked for and the table answered, and each `data-others`
entry ends in `:of`, the id of that fly's device's first fly.

## The Apple TV and the iPhone

The game reaches the room only through `TableSocket`
(`packages/contracts/src/socket.ts`): send, and once a frame drain what has
arrived. The browser's is a WebSocket (`apps/web/src/online/socket.ts`).

- **Apple TV.** Its runtime has no `WebSocket`, so its host bridges one as
  `globalThis.__native.socket` (`apps/tvos/src/SocketBridge.mm`), an
  `NSURLSessionWebSocketTask` on a queue of its own; the room's line and
  the Lobby's both go through it. The game polls it each frame
  (`apps/web/src/online/native-socket.ts`): each binary message is copied
  into one buffer kept in JavaScript, reusing views after the first message
  of each length, and a
  frame with nothing new is two native calls per live line. The host keeps as much waiting
  as a browser does, and closes every line (1001) when the app goes to the
  background; its flies rest in the room meanwhile, and coming back the line
  opens again at once. Its room server is `wss://flies.isaacthoman.com/rooms`
  (`ROOMS_URL` at build, or `?rooms=` in the launch config's URL, for
  another), which App Transport Security allows as it is. Typing (a room's
  name, a password, a code) is tvOS's own keyboard, as
  `globalThis.__native.keyboard`, made a `TextEntry` (`NativeTextEntry`,
  `apps/web/src/ui/text-entry.ts`). There is no share sheet or clipboard, so
  no Share the link: at a room, Online shows its QR code and its code (as it
  does everywhere) for a phone to scan or another TV to type. The simulator
  check opens the app `?alone`, so that it never sits with everyone on the
  site's room server, and then sits it in a room of eight of its own. A
  16 November 2026 capture on an Apple TV 4K (3rd generation), tvOS 27.2.1,
  release build, reported mean 59.9 fps in play (55–60 in 10-second windows)
  with seven synthetic peers. See `docs/apple-tv.md`, "Eight flies on a TV",
  for its limits; its exact source revision is unknown. The command is
  `npm run tvos:soak -- --device <udid> --minutes 20 --table`; several local
  brains have not yet been measured there.
- **iPhone and iPad.** No bridge: the app is the web build in a web view,
  whose own WebSocket reaches `wss://flies.isaacthoman.com/rooms` (and a room
  server of your own at an address or a `.local` name, for development), and
  whose `navigator.share` is the system share sheet. Names and passwords are
  typed as in Safari, with the phone's keyboard and AutoFill. The links it
  shares are the site's; with a matching site association and signed app built
  with `IOS_LINKS=1`, they support universal links and the site's AutoFill
  passwords. `APPLE_TEAM_ID` overrides the site's default team; `0` disables
  its association file. iOS suspends a
  backgrounded app, so away is the normal state there; the 10 minutes and
  coming back are what make it work. `npm run ios:check` turns Join others
  off for its first launch (`-FlySettings`), and its tables test opens the
  app by a room's link, which it sits in instead. `docs/ios.md`, "Tables with others".

### Found-food lifetime

Found food carries an optional `lasts` duration (seconds, at most 1520).
The picnic sends the time left until its juice or crumb finishes fading.
The room owns that expiry and announces its disappearance as ordinary food
`gone` IDs. Deadlines use the wall clock and are retained with the table,
so idle rooms and restarts do not extend a lifetime. Welcome and save both
clear expired food before taking a snapshot. Older devices and saves omit
the duration or deadlines and receive the longest picnic lifetime; older
rooms could ignore the additive duration field when it was introduced within
protocol 3. The current wire protocol is 5.

### Bite acknowledgements

Every processed bite, including a refusal, produces a food acknowledgement:
known food carries its authoritative amount. With a nutrition receipt, an
acknowledged food omitted from amounts no longer exists. Missing-food
refusals never add arbitrary IDs to the room-wide disappearance list.
Devices predict the food being eaten but feed hunger and the crop only after
acknowledgement. The optional `meal: [amount, sugar]` receipt counts exactly
what that player was granted since its previous acknowledgement, including
the sweetness of partial bites. Rejoining discards undelivered receipts.
Welcome advertises receipt support with optional `meals: true`. This is
introduced additively within protocol 3. Current clients still retain an
optimistic nutrition fallback for rooms omitting receipt support, rather
than treating historical or rounded cumulative totals as fresh nutrition;
rooms speaking a different protocol are refused.

<!-- docs-check: generated DATA_DIR/tables.json -->
