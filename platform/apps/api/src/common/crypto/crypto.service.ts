import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";

/**
 * AES-256-GCM envelope encryption for provider API credentials.
 * The master key is derived from JWT_ACCESS_SECRET so a single env
 * leak doesn't separate cipher from key (acceptable for v1; rotate
 * to a dedicated KMS-managed key when going to production).
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor() {
    const seed = process.env.API_KEY_ENCRYPTION_SECRET ?? process.env.JWT_ACCESS_SECRET ?? "";
    if (!seed || seed.length < 16) {
      this.logger.warn("Weak encryption seed — set API_KEY_ENCRYPTION_SECRET to a 32+ char value.");
    }
    this.key = crypto.createHash("sha256").update(seed).digest();
  }

  encrypt(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      ciphertext: enc.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  }

  decrypt(ciphertext: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  }

  // Returns "…last4" for UI display without ever leaking the secret.
  mask(value: string): string {
    if (!value) return "";
    if (value.length <= 4) return "…" + value;
    return "…" + value.slice(-4);
  }
}
