export interface PutFileResult {
  url: string;
}

// A place to persist files that need a durable, fetchable URL: rendered
// clips/SRTs (always) and the source upload/watermark (only when a worker in
// a different process/machine needs to fetch them back down, i.e. blob mode).
export interface StorageAdapter {
  putFile(key: string, localPath: string, contentType: string): Promise<PutFileResult>;
  fetchToLocal(url: string, destPath: string): Promise<void>;
}
