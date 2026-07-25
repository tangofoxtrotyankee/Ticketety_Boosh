import { randomBytes, timingSafeEqual } from "crypto";

// RFC 4648 base32 alphabet without padding — URL- and QR-friendly.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Encode a buffer as unpadded base32. */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** 128-bit cryptographically random ticket code, base32-encoded (26 chars). */
export function generateTicketCode(): string {
  return base32Encode(randomBytes(16));
}

/** Constant-time string comparison to avoid timing side-channels on codes. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const TICKET_CODE_REGEX = /^[A-Z2-7]{26}$/;
