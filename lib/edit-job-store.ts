/**
 * On-disk store for edit-job sidecars.
 *
 * The `/api/edit-video/submit` route does the slice work, persists a
 * sidecar with all the local paths it produced, and hands the FAL
 * `requestId` back to the client. The client polls the FAL status
 * route directly; once Seedance is done it calls `/finalize`, which
 * loads the sidecar by `editJobId` and assembles the final MP4.
 *
 * We intentionally use plain JSON files (not a DB) because:
 *   - Hackathon scope, single-instance dev server, no persistence
 *     requirements beyond "survives the FAL round-trip".
 *   - We already drop everything else under `public/uploads/` so
 *     debugging is just opening the folder.
 *   - The sidecar travels with the job's intermediate files, so when
 *     we delete a job folder cleanup is one `rm -rf`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EDIT_DIR_NAME, UPLOAD_DIR_NAME } from "./constants";
import type { EditJob } from "./types";

const SIDECAR_FILENAME = "job.json";

/** Absolute path to `public/uploads/edits/`. */
export function getEditsRootDir(): string {
  return path.join(process.cwd(), "public", UPLOAD_DIR_NAME, EDIT_DIR_NAME);
}

/** Absolute path to `public/uploads/edits/{editJobId}/`. */
export function getEditJobDir(editJobId: string): string {
  return path.join(getEditsRootDir(), editJobId);
}

/** Public URL prefix for files inside an edit job dir. */
export function getEditJobPublicPrefix(editJobId: string): string {
  return `/${UPLOAD_DIR_NAME}/${EDIT_DIR_NAME}/${editJobId}`;
}

export async function ensureEditJobDir(editJobId: string): Promise<string> {
  const dir = getEditJobDir(editJobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeEditJob(job: EditJob): Promise<void> {
  const dir = await ensureEditJobDir(job.editJobId);
  const sidecar = path.join(dir, SIDECAR_FILENAME);
  await writeFile(sidecar, JSON.stringify(job, null, 2), "utf8");
}

/**
 * Loads a sidecar by id. Throws a helpful error if the id is unknown
 * — this usually means the dev server restarted between submit and
 * finalize, wiping the public/uploads/edits scratch space.
 */
export async function readEditJob(editJobId: string): Promise<EditJob> {
  // Reject path-traversal attempts before touching the filesystem. The
  // id is generated server-side via nanoid, so anything with separators
  // or `..` came from a tampered client.
  if (!/^[a-zA-Z0-9_-]+$/.test(editJobId)) {
    throw new Error(`Invalid editJobId "${editJobId}".`);
  }
  const sidecar = path.join(getEditJobDir(editJobId), SIDECAR_FILENAME);
  let raw: string;
  try {
    raw = await readFile(sidecar, "utf8");
  } catch {
    throw new Error(
      `Edit job "${editJobId}" not found. The server may have been restarted; resubmit the edit.`,
    );
  }
  return JSON.parse(raw) as EditJob;
}
