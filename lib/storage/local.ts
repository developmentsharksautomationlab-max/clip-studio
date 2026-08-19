import { promises as fs } from "node:fs";
import path from "node:path";
import { PUBLIC_GENERATED_DIR } from "../video/paths";
import type { PutFileResult, StorageAdapter } from "./types";

// Default adapter: everything stays on local disk under public/generated, so
// it's served directly by Next.js's static file handling. Used whenever no
// BLOB_READ_WRITE_TOKEN is configured, which keeps `npm run dev` working with
// zero cloud setup.
export const localStorage: StorageAdapter = {
  async putFile(key: string, localPath: string): Promise<PutFileResult> {
    const destPath = path.join(PUBLIC_GENERATED_DIR, key);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    if (path.resolve(localPath) !== path.resolve(destPath)) {
      await fs.copyFile(localPath, destPath);
    }
    return { url: `/generated/${key.split(path.sep).join("/")}` };
  },

  async fetchToLocal(url: string, destPath: string): Promise<void> {
    const sourcePath = url.startsWith("/generated/")
      ? path.join(PUBLIC_GENERATED_DIR, url.slice("/generated/".length))
      : url;
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(sourcePath, destPath);
  },
};
