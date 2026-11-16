// A room's lock: its password as the server keeps it, a salted scrypt hash,
// so neither the file of tables nor the log holds anything that would open
// it. Checking a password takes as long whether it is close or not, and
// runs off the event loop (Node's thread pool), so a guess can't stall
// everyone else's tables.

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** A password's hash and its salt, base64url. */
export type Lock = { salt: string; hash: string };

/** scrypt's cost: 2^14 rounds of 8 × 128 bytes, about 16 MB and a few tens of ms a try. */
const COST = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32;

const derive = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => scrypt(password.normalize("NFC"), salt, KEY_BYTES, COST, (error, key) => (error ? reject(error) : resolve(key))));

export async function lock(password: string): Promise<Lock> {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64url"), hash: (await derive(password, salt)).toString("base64url") };
}

export async function opens(password: string, lock: Lock): Promise<boolean> {
  const want = Buffer.from(lock.hash, "base64url");
  const got = await derive(password, Buffer.from(lock.salt, "base64url"));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Whether something read back from the file of tables is a lock. */
export const isLock = (v: unknown): v is Lock => !!v && typeof (v as Lock).salt === "string" && typeof (v as Lock).hash === "string";
