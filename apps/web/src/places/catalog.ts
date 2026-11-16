// The places the fly can live, by name only, for the Place tool and the
// settings: what each is called, and what the fly stands on there. How each
// is built and drawn is in its own folder, and places/index.ts puts them
// together; this list stays free of three.js so logic can use it.

export const PLACES = [
  { id: "picnic", name: "Picnic table", to: "the picnic table", surface: "table" },
  { id: "lab", name: "Lab bench", to: "the lab bench", surface: "bench" },
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
