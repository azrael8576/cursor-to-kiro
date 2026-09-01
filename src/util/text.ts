import { createHash } from "node:crypto";

export const UTF8 = new TextEncoder();

export function lf(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

export function generatedText(value: string): Uint8Array {
  const normalized = lf(value);
  return UTF8.encode(normalized.endsWith("\n") ? normalized : `${normalized}\n`);
}

export function decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && Buffer.compare(left, right) === 0;
}
