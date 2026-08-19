import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import type { PutFileResult, StorageAdapter } from "./types";

// Used in production (worker + Vercel web app) when BLOB_READ_WRITE_TOKEN is
// set: uploads land in Vercel Blob so the web app and the separate worker
// process can both reach them by URL instead of sharing a local disk.
export const blobStorage: StorageAdapter = {
  async putFile(key: string, localPath: string, contentType: string): Promise<PutFileResult> {
    const stream = createReadStream(localPath);
    const blob = await put(key, stream, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url: blob.url };
  },

  async fetchToLocal(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  },
};
