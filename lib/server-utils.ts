/**
 * Tiny server-only helpers shared by route handlers.
 *
 * IMPORTANT: do not import client-only code here. This file is allowed
 * to use Node + Next runtime APIs.
 */
import type { NextRequest } from "next/server";
import type { ApiResponse } from "./types";

export function jsonError(message: string, status: number): Response {
  const body: ApiResponse<never> = { success: false, error: message };
  return Response.json(body, { status });
}

export function jsonOk<T>(data: T): Response {
  const body: ApiResponse<T> = { success: true, data };
  return Response.json(body);
}

/**
 * Resolves the public origin for the request (e.g. https://app.example.com).
 * Honors x-forwarded-host/proto when present (Vercel, reverse proxies) and
 * falls back to request.nextUrl.origin in dev.
 */
export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) {
    const proto = forwardedProto ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected server error.";
}
