"use client";

import { useCallback, useState } from "react";
import { FileUpload, Text, toast } from "@sarvam/tatva";
import { differenceBy } from "lodash";
import { ASSET_LIMITS, type AssetKind } from "@/lib/constants";
import type { UploadResponse, UploadedAsset } from "@/lib/types";
import { validateFileForKind } from "@/lib/validation";
import { postFormData } from "@/app/hooks/useApi";

interface AssetUploadFieldProps {
  kind: AssetKind;
  label: string;
  assets: UploadedAsset[];
  setAssets: (updater: (prev: UploadedAsset[]) => UploadedAsset[]) => void;
}

interface PendingFile {
  file: File;
  status: "uploading" | "error";
  errorMessage?: string;
}

/** Override the read-only `Blob.prototype.size` getter on this instance. */
function withFakeSize(file: File, sizeBytes: number): File {
  Object.defineProperty(file, "size", {
    value: sizeBytes,
    configurable: true,
    writable: false,
  });
  return file;
}

/**
 * One AssetUploadField per kind (image / video / audio). Wraps Tatva's
 * FileUpload in advanced (`fileItems`) mode so we can render per-file
 * upload status and errors without a custom progress component.
 */
export function AssetUploadField({
  kind,
  label,
  assets,
  setAssets,
}: AssetUploadFieldProps) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const limit = ASSET_LIMITS[kind];

  const fileItems = [
    ...assets.map((a) => ({
      // Tatva's FileUpload reads `file.size` to render the byte string. We
      // don't keep the original File around after upload, so we synthesize
      // a zero-byte File and shadow its read-only `size` getter with the
      // real value we got from the server. Cheap (no buffer allocation)
      // and visually accurate.
      file: withFakeSize(
        new File([], a.originalName, { type: a.mimeType }),
        a.sizeBytes,
      ),
      status: "uploaded" as const,
    })),
    ...pending.map((p) => ({
      file: p.file,
      status: p.status,
      errorMessage: p.errorMessage,
    })),
  ];

  const handleFilesSelect = useCallback(
    async (allSelected: File[]) => {
      const known = [
        ...assets.map((a) => ({ name: a.originalName })),
        ...pending.map((p) => ({ name: p.file.name })),
      ];
      const newFiles = differenceBy(
        allSelected.map((f) => ({ name: f.name, file: f })),
        known,
        "name",
      ).map((entry) => entry.file);

      if (newFiles.length === 0) return;

      // Pre-validate. Stop on the first failure to avoid partial uploads.
      for (const file of newFiles) {
        const v = validateFileForKind(file, kind);
        if (!v.ok) {
          toast.error(`${file.name}: ${v.error}`);
          return;
        }
      }

      if (assets.length + pending.length + newFiles.length > limit.maxCount) {
        toast.error(`At most ${limit.maxCount} ${kind} files are allowed.`);
        return;
      }

      setPending((prev) => [
        ...prev,
        ...newFiles.map<PendingFile>((file) => ({ file, status: "uploading" })),
      ]);

      await Promise.all(
        newFiles.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("kind", kind);
          try {
            const data = await postFormData<UploadResponse>(
              "/api/upload",
              formData,
            );
            setAssets((prev) => [...prev, data.asset]);
            setPending((prev) => prev.filter((p) => p.file !== file));
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Upload failed.";
            toast.error(`${file.name}: ${msg}`);
            setPending((prev) =>
              prev.map((p) =>
                p.file === file
                  ? { ...p, status: "error", errorMessage: msg }
                  : p,
              ),
            );
          }
        }),
      );
    },
    [assets, kind, limit.maxCount, pending, setAssets],
  );

  const handleFileRemove = useCallback(
    (index: number) => {
      const assetIndex = index;
      if (assetIndex < assets.length) {
        const removed = assets[assetIndex];
        setAssets((prev) => prev.filter((a) => a.id !== removed.id));
        return;
      }
      const pendingIndex = assetIndex - assets.length;
      setPending((prev) => prev.filter((_, i) => i !== pendingIndex));
    },
    [assets, setAssets],
  );

  const tagFor = (n: number): string =>
    n === 1 ? `1 file uploaded` : `${n} files uploaded`;

  return (
    <div className="flex flex-col gap-tatva-8">
      <div className="flex items-baseline justify-between">
        <Text as="label" variant="label-md" tone="default">
          {label}
        </Text>
        <Text variant="label-sm" tone="tertiary">
          {tagFor(assets.length)} · max {limit.maxCount}
        </Text>
      </div>
      <FileUpload
        multiple
        maxFiles={limit.maxCount}
        acceptedTypes={limit.acceptedTypes as Record<string, string[]>}
        maxSize={limit.maxSizeBytes}
        primaryText={limit.placeholderText}
        secondaryText={limit.secondaryText}
        fileItems={fileItems}
        onFilesSelect={handleFilesSelect}
        onFileRemove={handleFileRemove}
      />
    </div>
  );
}
