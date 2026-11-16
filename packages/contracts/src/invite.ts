// Invitations that reach the game from its host while it runs: a table's
// link opened on a phone where the app is installed (a universal link).

/**
 * Dispatched on `window` as a CustomEvent whose `detail` is the link (an
 * https URL with `?table=<code>`). The game sits down at that room, leaving
 * any other. A host started by such a link loads the page with `?table=`
 * instead.
 */
export const INVITE_EVENT = "flyinvite";
