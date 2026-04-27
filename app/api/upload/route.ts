import type { NextRequest } from "next/server";
import { uploadKindSchema } from "@/lib/validation";
import { validateFileForKind } from "@/lib/validation";
import { saveAsset } from "@/lib/upload-utils";
import {
  getErrorMessage,
  getRequestOrigin,
  jsonError,
  jsonOk,
} from "@/lib/server-utils";
import type { UploadResponse } from "@/lib/types";

// Multipart uploads must run on the Node runtime (not edge) for fs access.
export const runtime = "nodejs";

export async function POST(request: NextRequest): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Expected multipart/form-data with `file` and `kind` fields.", 400);
  }

  const rawKind = formData.get("kind");
  const kindResult = uploadKindSchema.safeParse(rawKind);
  if (!kindResult.success) {
    return jsonError("Field `kind` must be one of: image, video, audio.", 400);
  }
  const kind = kindResult.data;

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return jsonError("Field `file` is required.", 400);
  }

  const validation = validateFileForKind(fileEntry, kind);
  if (!validation.ok) {
    return jsonError(validation.error ?? "Invalid file.", 400);
  }

  try {
    const result = await saveAsset({
      file: fileEntry,
      kind,
      origin: getRequestOrigin(request),
    });
    if (!result.ok) {
      return jsonError(result.error.message, 400);
    }
    const payload: UploadResponse = { asset: result.asset };
    return jsonOk(payload);
  } catch (error: unknown) {
    return jsonError(`Upload failed: ${getErrorMessage(error)}`, 500);
  }
}
