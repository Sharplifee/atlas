import { describe, it, expect, beforeAll } from "vitest";

// A deterministic 32-byte key for the test (base64 of 32 zero bytes would be
// weak; use a fixed random-looking constant instead). Set before importing.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = Buffer.from(
    "atlas_test_key_0123456789_abcdef"
  ).toString("base64"); // exactly 32 bytes
});

describe("token encryption (AES-256-GCM)", () => {
  it("round-trips a token", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const secret = "EAAB_super_secret_system_user_token_123";
    const ct = encrypt(secret);
    expect(ct).not.toContain(secret);
    expect(ct.split(".")).toHaveLength(3);
    expect(decrypt(ct)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("fails to decrypt a tampered payload", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const ct = encrypt("hello");
    const [iv, tag, data] = ct.split(".");
    const tampered = [iv, tag, Buffer.from("garbage").toString("base64")].join(".");
    expect(() => decrypt(tampered)).toThrow();
  });
});
