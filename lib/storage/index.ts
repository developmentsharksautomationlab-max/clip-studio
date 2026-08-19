import { localStorage } from "./local";
import { blobStorage } from "./blob";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, PutFileResult } from "./types";

export const storage: StorageAdapter = process.env.BLOB_READ_WRITE_TOKEN ? blobStorage : localStorage;

export function isBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
