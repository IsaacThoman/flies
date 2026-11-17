# Rendering

Historical timings and trial counts have [measurement provenance](measurements.md).

## Frame and cost

On the Apple TV the game renders 640×480, laid out for 16:9 (the picture is
squeezed into the 4:3 buffer and stretched back out), with no antialiasing and
a pixel ratio of 1. Elsewhere (`apps/web/src/display.ts`) the frame takes the
screen's shape with square pixels over the supported 1:4 to 4:1 aspect
range, targeting about 640×480 = 307,200 pixels (dimensions are rounded): 739×416 in a 16:9 window, exactly 640×480 at 4:3, 376×815 on a phone
held upright, 853×360 on an ultrawide. So the pixels are as chunky for the
size of the screen as on the TV (each covers about the same area of it), the
GPU fills about as many. Extreme aspect ratios are clamped to that range;
this pixel target alone does not guarantee the same frame cost. Settings → Picture →
Pixels renders the world at a half or a third of the frame each way (on the
TV 320×240 or 214×160) under crisp menus at the frame's own size. Resizing or
turning the screen lays the frame and every layout out again at the start of
the next frame; nothing in the world is built again.

The shots are framed for 16:9. On a wider screen the camera keeps their
height and sees more to the sides; on a narrower one it keeps seven tenths of
the extra height as field of view (`camera.ts`, `fieldOfView`), so on a phone
held upright the fly is about two fifths of the screen across in Follow (on
the TV, a quarter of its width) rather than a quarter (keeping the TV's width,
a small fly in a great deal of sky and table) or a half (keeping its pixels,
too big to turn round in). The whole table keeps its width, so it always
fits. Playing on a short screen, where the shelf and the label take more of
the height, the fly is raised clear of them and drawn a little smaller
(`apps/web/src/ui/layout.ts`, `playRoom`). Every layout (the shelf, the hints, the
caption, the fly's-eye picture and the corner one, the title, the menus,
About) is worked out from the frame in design units (480
to the shorter side, and at least 1.25 CSS pixels on a touch screen, so that
a finger has room) inside the screen's safe area, and comes out exactly where
it always was on the TV.

The backdrop (sky, clouds, hills, lollipop trees, lawn, daisies,
lake) and the table are two passes with their own depth ranges. Static things
are merged by material into a handful of meshes with vertex colours and frozen
matrices (the crumbs, pips and saucer go into those too, and the small things'
contact shadows are one merged mesh); seeds, sugar grains, dew, trees,
daisies, clouds, bubbles, fireflies, puffs and food are instanced. Rain is
three draws, only while it rains: the streaks (one quad a drop, placed and
moved entirely in the shader from the time), the splashes (a pool of 56, each
a ring and a crown of droplets, one instanced draw) and the beads on the fruit;
the table's own beads and puddles are in its shader, as many as there are
pixels for. The ripple round food that has just landed is one draw for under
a second. Each visitor is one draw while it is about, the gull's shadow is
in the table's and the fly's own shading. These paths reuse their animation
state; the game as a whole does not promise zero allocations per frame.
The footprints are one instanced draw while any are left (at most 128, two
triangles each), multiplied into what they lie on, so they need no light; a
print is written only when a foot is set down, and fades in the shader.
Menus and hints are one 2D canvas drawn over the frame,
uploaded only when something on it changes (at most 30 times a second; the
in-game shimmer at 10).

Measured in Chromium on an M-series Mac (Settings → Picture → Frame stats shows it live,
and the canvas's `data-calls`, `data-triangles`, `data-frame-ms` and
`data-eyes-ms`): playing, 23 draws and about 106,000 triangles a frame (in
rain 26 and 118,000, and about 0.07 ms more JavaScript; with a butterfly, a
ladybird, a falling leaf, the gull, the boat and a drop of juice all about at
once, a draw for each in view and 0.04 ms; with footprints, one more draw
and at most 256 triangles, and about 7 µs of JavaScript a frame in V8's
interpreter); on a
frame the eyes refresh, about 70 draws and 280,000 triangles (the most the
end-to-end run sees is about 85 draws and 300,000), the eyes' own part about 45
draws and 1.5 to 2.5 ms (mostly the read-back). JavaScript per frame about 1 to
2.5 ms in the browser. The corner picture of what it sees (in the screensaver,
or always) is one more draw (its panel and every facet are instances of one
quad, drawn with the menus) and about 3,500 triangles, with no measurable
JavaScript. The X-ray is one more draw (the nervous system: one mesh, posed by
the body's joint uniforms, its glow a uniform array of 24 vec4s, a float for each of its 93 parts) and about
16,000 triangles; the panel one more draw (the same geometry, its backdrop the
first two triangles) and the same triangles; JavaScript per frame within the
noise of none (the glow, the X-ray's easing and the corners together are
about 12 µs a frame in V8's interpreter alone). The end-to-end test fails above 150
draws or 500,000 triangles. Physical Apple TV measurements and the unattended
soak command are in [docs/apple-tv.md](apple-tv.md).

In a browser the game watches its own pace (`apps/web/src/quality.ts`): frames
falling behind, or the brain running slower than real time, and it draws less
(the eyes' finer detail, then 30 frames a second, then bigger pixels, then the
eyes refreshing half as often, then bigger pixels still), never more than
Settings asks for, and never at the brain's expense. `docs/web.md` has the
measurements. On the Apple TV it is drawn as it always was.

