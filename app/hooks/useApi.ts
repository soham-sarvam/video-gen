"use client";

import type { ApiResponse } from "@/lib/types";

/** Fetches a JSON endpoint and unwraps the ApiResponse envelope. */
export async function fetchJson<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json: ApiResponse<T> = await res.json();
  if (!json.success || json.data === undefined) {
    throw new Error(json.error ?? `Request failed (${res.status}).`);
  }
  return json.data;
}

/** Multipart variant — caller passes a FormData; do NOT set Content-Type. */
export async function postFormData<T>(
  input: RequestInfo,
  formData: FormData,
): Promise<T> {
  const res = await fetch(input, { method: "POST", body: formData });
  const json: ApiResponse<T> = await res.json();
  if (!json.success || json.data === undefined) {
    throw new Error(json.error ?? `Request failed (${res.status}).`);
  }
  return json.data;
}
