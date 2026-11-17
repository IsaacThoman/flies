// The places the fly can live, by name only, for the Place tool and the
// settings: what each is called, what the fly stands on there, and its
// colour, where a place is shown too small for words (a room in the list of
// rooms online). How each
// is built and drawn is in its own folder, and places/index.ts puts them
// together; this list stays free of three.js so logic can use it.

export const PLACES = [
  { id: "picnic", name: "Picnic table", to: "the picnic table", surface: "table", colour: "#e5484d" },
  { id: "windowsill", name: "Windowsill", to: "the windowsill", surface: "sill", colour: "#6cc4f2" },
  { id: "lab", name: "Lab bench", to: "the lab bench", surface: "bench", colour: "#3dbfa8" },
  { id: "bar", name: "Bar", to: "the bar", surface: "bar", colour: "#e0a23a" },
  { id: "greenhouse", name: "Greenhouse", to: "the greenhouse", surface: "bench", colour: "#83a66a" },
  { id: "restaurant", name: "Restaurant", to: "the restaurant", surface: "room", colour: "#8c2f55" },
  { id: "kitchen", name: "Kitchen counter", to: "the kitchen counter", surface: "counter", colour: "#d5a146" },
] as const;

export type PlaceId = (typeof PLACES)[number]["id"];
export type PlaceInfo = (typeof PLACES)[number];

export function placeInfo(id: PlaceId): PlaceInfo {
  return PLACES.find((p) => p.id === id) ?? PLACES[0];
}

export function isPlaceId(id: unknown): id is PlaceId {
  return PLACES.some((p) => p.id === id);
}

/** The place after this one, in turn. */
export function nextPlace(id: PlaceId): PlaceId {
  const i = PLACES.findIndex((p) => p.id === id);
  return PLACES[(i + 1) % PLACES.length].id;
}
