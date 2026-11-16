# Flies at one table (a spike)

Several people's flies on the same picnic table. This is a spike: it proves
the design and measures it, and is not a product. The findings are in the
pull request that brought it.

```sh
npm run room                      # the room server, ws://localhost:8787 (one table)
npm run dev                       # the game; open http://localhost:5173/?room in two tabs
node scripts/room.ts --clients 2  # or let a script do it: tabs, tools, screenshots, numbers
```

`?room` joins the server on this host's port 8787; `?room=ws://host:port` joins
another. Without it nothing here runs and the game is as it was.

## Who owns what

| | Owner | How the others get it |
| --- | --- | --- |
| A fly: where it is, its pose | Its player's device, where its brain and body run | About 20 states a second, through the room, drawn a little in the past and interpolated (`packages/net/src/track.ts`) |
| What the fly feels and does about the others | Its own device | The others are bodies its eyes see and its body meets (below); nothing else passes between flies |
| The food: the table's, dropped, found; who ate how much | The room (`TableFood`) | Each device eats at once and tells the room; the room's account, less what the device has eaten since, is what is left (`FoodMirror`) |
| A thrown ball | The room's clock | Its path and the moment its dive starts; every device puts it in the same place at the same moment (`ball.ts`) |
| The light, the weather, the table's clock | The room | Chosen on any device, told to all; "Now" follows the room's clock, not each device's |
| The high bubbles | The room's seed and clock | Each device works them out (`bubbles.ts`); a device whose fly bursts one says so |
| Visitors (gust, gull, leaf, butterfly, ladybird, juice, boat) | The room says when, with a seed | Each device starts the visit from that seed (`SceneSet.happen`) |

## What the body adds

Two flies can't stand in the same spot (`packages/body/src/crowd.ts`). Each
fly is a capsule 2.1 mm long and 1.5 mm across; walking into another, the fly
is pushed back out of it, so it stops against it or slides past; flying into
one, it bounces off and feels the hit. Its antennae press on another fly's
body as on a wall (`bump`), and being pushed is felt as a touch (0.3). A device
moves only its own fly, out of where it sees the others, so two flies that
meet each step aside from the other as its own device sees it.

## The wire

One WebSocket per player. The first message is the client's `hello` with the
protocol version (now 1); the room refuses another. Binary messages are
little-endian, with a type byte first:

| Type | Direction | Layout | Bytes |
| --- | --- | --- | --- |
| 1 `FLY` | device to room, every 50 ms | type, state | 32, or 46 with the hand |
| 2 `FLIES` | room to device, every 50 ms when anything is new | type, count, then each fly's player id and state | 2 + 33 or 47 a fly |
| 3 `BITES` | device to room, at most every 100 ms | type, sequence (u16), count, then each food's id (u32) and amount (f32) | 4 + 8 a bite |

A fly's state (31 bytes, 45 with the hand):

| Field | Encoding |
| --- | --- |
| flags | u8: airborne 1, away (its device has stopped) 2, eating 4, hand out 8, holding Select 16, at the remote 32 |
| sequence | u16, wrapping |
| time | u32, room ms when the fly was there |
| position | 3 × i16, 1/50 mm (±655 mm) |
| heading | u16, a turn in 65,536 |
| the ground's normal | 2 × i8, x and z (y follows) |
| velocity | 3 × i16, mm/s |
| pose | i8 speed (¼ body length/s), i8 turn (1/16 rad/s), u8 wings, groom, feed, crouch (1/255), i8 pitch (1/150 rad), i8 roll (1/200 rad) |
| the hand, if out | 3 × i16 pointer (1/20 mm), 3 × i16 camera (1/10 mm, for the way a puff blows), u8 tool, u8 kind |

Fly states may be lost (the room's `--loss` drops only these, as an
unreliable channel would); bites and JSON must arrive. JSON messages
(`packages/net/src/protocol.ts`, `ClientMessage` and `ServerMessage`):

| From the device | |
| --- | --- |
| `hello {v}` | the protocol version |
| `ping {t}` | the device's clock; answered `pong {t, now}` with the room's |
| `drop {id, kind, x, z, at}` | food dropped; the device names it (player id × 1,000,000 + its count) so its fly can eat it before the room has heard |
| `ball {at, from, via, to}` | a throw, starting at room time `at` (a moment from now, so everyone sees all of the dive) |
| `world {light, weather}` | the table's light and weather chosen |
| `pop {slot, cycle, at}` | its fly burst a bubble |
| `found {id, name, x, z, r, sweet}` | the place put food out on this device (named from where it lies) |

| From the room | |
| --- | --- |
| `welcome {v, id, colour, seed, now, hours, world, players, foods, balls, happenings, bubbles}` | the table as it is |
| `refused {reason}` | wrong version |
| `joined {id, colour}`, `left {id}` | |
| `drop`, `ball`, `world`, `pop`, `found` | as above, to everyone else (`by` the player) |
| `happening {kind, seed, at}` | a visitor comes |
| `food {ack, amounts, gone, eaten}` | what changed of the food, at most ten times a second: amounts left, what is gone, everyone's total eaten, and the last of this player's bites counted |

## The room checks

A fly's state is refused if it is off the table, inside what stands on it,
from the future, or further from the last than a fly could go (60 mm/s on its
feet, 1.5 m/s in the air); a fly refused ten times running is taken where it
says (`RESYNC`). A bite is refused if the fly (where the room last had it) is
more than 4 mm past the food's edge, or eats faster than a fly can. A player
can drop food only under its own name. None of this can stop a device from
lying about where its fly is within those bounds: the device is the authority.

## Watching it

`node scripts/room.ts` starts the room and the game, opens headless tabs that
join, uses the tools at set moments, records each tab's `data-*` state four
times a second, screenshots every tab at the same moments (with `--pin`, from
one camera for all), and sums up. Its comment lists the plans and the ways to
spoil the network or a tab. What it writes goes to a temporary folder. The
canvas carries the online state for it: `data-online`, `data-player`,
`data-me`, `data-others` (each other fly: id, present, asleep or airborne,
position, how far in the past it is drawn, the share of frames past its
newest state, its time), `data-closest` (the nearest any other fly's body came,
mm; below 0 they overlapped on this screen), `data-contact`, `data-predicted`
and `data-granted` (food eaten by this fly's reckoning and by the room's),
`data-bubbles`, `data-visitors`, `data-balls`, `data-ball-heard`,
`data-looming-now`, `data-rtt`, `data-fps`, `data-net-in` and `data-net-out`.
`node --no-opt --no-sparkplug --no-maglev scripts/online-bench.ts 8` times
what each other fly costs this device's JavaScript, as the Apple TV would run
it.
