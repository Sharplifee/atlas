import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for tenant ad-platform tokens at rest.
 *
 * ENCRYPTION_KEY is a 32-byte key, base64 encoded (generate with
 * `openssl rand -base64 32`). Ciphertext is stored as a single string:
 *   base64(iv).base64(authTag).base64(ciphertext)
 *
 * This module is server-only. Never import it into client code.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // 96-bit nonce, recommended for GCM

function key(): Buffer {
  const raw = env.requireEncryptionKey();
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must decode to exactly 32 bytes (base64). " +
        "Generate one with: openssl rand -base64 32"
    );
  }
  return k;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    ct.toString("base64"),
  ].join(".");
}

export function decrypt(payload: string): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext payload.");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Best-effort masked preview for UI (never returns the secret). */
export function maskToken(external: string): string {
  if (external.length <= 6) return "••••";
  return `${external.slice(0, 4)}••••${external.slice(-2)}`;
}
