import { it, expect } from "vitest";
import { createHash } from "node:crypto";
import { md5, sha256, base64Encode, base64Decode } from "@/engine/crypto/hash";
it("matches node crypto", () => {
  for (const s of ["", "abc", "password", "netsec123", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(200), "héllo wörld 🙂"]) {
    expect(md5(s)).toBe(createHash("md5").update(s).digest("hex"));
    expect(sha256(s)).toBe(createHash("sha256").update(s).digest("hex"));
    expect(base64Decode(base64Encode(s))).toBe(s);
  }
});
