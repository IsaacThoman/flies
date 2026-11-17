# Drive

A first-person car on a country loop, with the fly on the dashboard. You
drive; hand it the wheel and its brain drives, from what its eyes see.
It is a second page of the web build, `apps/web/car.html` (with
`npm run dev`, open car.html at the address it prints), with its code in
`apps/web/src/car/`. It runs in a browser only; the Apple TV and iPhone
apps don't include it.

## Controls

| | Keyboard | Game pad | Touch |
| --- | --- | --- | --- |
| Throttle | Up or W | Right trigger, D-pad up | Hold anywhere |
| Brake, then reverse | Down or S | Left trigger, D-pad down | Hold and pull down |
| Steer | Left/Right or A/D | Left stick | Drag across |
| Hand the wheel to the fly, or take it back | Enter, space or F | A | Tap |
| Back onto the road where you are | R | Y | |

The mouse does nothing, so a click to bring the window forward doesn't hand
over the wheel. Driving at all takes the wheel back.

The car grips harder than a road car (12 m/s² sideways): the loop's tightest
bend, 67 m across, goes at about 100 km/h, and flat out it does about
140 km/h, so the fastest corners need the brake. The view widens with speed
and glances into turns. The lamp above the centre screen is
green while the fly drives, blinks amber while its brain loads and is red if
the brain failed; the fly can't take the wheel until the brain is running.

## What the fly does

The fly stands on a ball on top of the dashboard, the way flies walk on an
air-supported ball in a lab, facing the road. Its brain is the fly game's
(a Web Worker, WebAssembly where the browser can run it), running the whole
time whoever drives.

- **It sees the road.** Its eyes are the fly game's: the world rendered round
  its head as six small views 20 times a second, read back and sampled to the
  brain's facets, with the same light adaptation
  ([the eyes](simulation.md#the-eyes)). The car's inside is on a layer they
  don't see. The centre screen shows the facets, a dot each.
- **It feels the car's front.** A front corner pressed against a rail or
  another car is its antenna on that side pushed back (`bumpLeft`,
  `bumpRight`); a knock is `touch`, fading over a quarter of a second. It
  feels no wind: it is inside.
- **Its walking and turning drive.** The brain's commands go through the fly
  game's `Behavior` (thresholds, smoothing, the giant fiber's arming) as for
  the fly on its table. Its walking speed in body lengths a second becomes
  the car's in car lengths a second (16 mm/s at full drive, 28 m/s). The car
  turns at a fifth of its yaw rate, as far as the steering's lock and the
  tyres' grip allow at that speed (below). Backing up reverses. The fly is posed from the same
  commands, so it walks and turns on its ball as the car goes.

Stand-ins, not the brain:

- **Braking when its giant fiber fires.** Where the fly would take off, the
  car brakes hard for as long as a take-off's refractory time (1.5 s).
- **Coasting.** When the fly stops walking the car rolls to a stop over a few
  seconds instead of halting, as a car does.
- **The rails.** A car pushed against a rail swings round to run along it
  and scrapes on; that is the car's physics, not a choice of the fly's.

The turning gain is the rig's, as in a lab's virtual reality for a fly on a
ball, where the experimenter sets how far the world turns for a turn of the
ball; which way and when are still the brain's. At 1 (the car turning as
fast as the fly) its turning bouts swing the car into the rails, and once
round to drive the loop backwards. Measured on 2026-11-17, two 90-second
drives at each gain on the development Mac, each a fresh brain:

| Turning gain | Driven (m) | Round the loop (m) | Against a rail | Walking |
| --- | --- | --- | --- | --- |
| 1 | 356, 481 | 336, −338 | 10%, 19% | 36%, 59% |
| 0.4 | 441, 704 | 413, 679 | 8%, 9% | 37%, 44% |
| 0.2 | 522, 801 | 506, 780 | 9%, 8% | 33%, 46% |

Two drives each is few, and drives vary with how much the fly walks, but
both pairs ran the same way; 0.2 is the setting.

What to expect: it drives in bouts, rests for seconds at a time, and turns a
great deal. In the runs made while building it (seeds unrecorded, a minute
or two each) it scraped along the left rail more often than the right; why
is not established. It does not follow the road: nothing in the model reads
a lane.

## For scripts

The canvas carries `data-brain`, `data-autopilot` (`on` or `off`),
`data-speed` (km/h), `data-escapes`, `data-progress` (metres round the loop),
`data-eyes` (pictures taken) and `data-walk` and `data-turn` (the brain's
latest commands), a few times a second. `globalThis.__drive` holds the car,
the pilot, the brain, the eyes and the other cars.
