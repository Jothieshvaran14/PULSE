import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "../config/index.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypt a string using AES-256-GCM.
 *
 * Format: iv:authTag:ciphertext (all hex-encoded)
 * Uses a random IV per encryption, making identical plaintexts produce different ciphertexts.
 */
export function encrypt(plaintext: string): string {
  const key = Buffer.from(config.tokenEncryptionKey, "hex");
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("hex"),
    authTag.toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

/**
 * Decrypt a string encrypted with `encrypt()`.
 *
 * Expects format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decrypt(encryptedText: string): string {
  const key = Buffer.from(config.tokenEncryptionKey, "hex");
  const [ivHex, authTagHex, ciphertextHex] = encryptedText.split(":");

  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
