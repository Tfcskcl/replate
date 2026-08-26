"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";
import { clerkEnabled } from "./clerk-safe";

/**
 * Authenticated fetch for the re-plate API.
 *
 * The API middleware now fails closed — a request without a valid bearer
 * token is rejected before it reaches a route. The dashboard previously sent
 * no Authorization header at all and only worked because the API passed
 * unauthenticated requests straight through. That is exactly the hole this
 * pairs with closing, so these must ship together.
 *
 * Usage:
 *   const api = useApi();
 *   const scores = await api.get<Score[]>("/api/compliance/scores");
 */
export function useApi() {
  // Safe: `clerkEnabled` is a build-time constant, so hook order is stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = clerkEnabled ? useAuth() : null;
  const getToken = auth?.getToken;

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");

      const token = getToken ? await getToken() : null;
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const res = await fetch(path, { ...init, headers });

      if (!res.ok) {
        throw new ApiError(res.status, await safeMessage(res), path);
      }
      // 204 and other empty bodies would otherwise throw on .json()
      if (res.status === 204 || res.headers.get("content-length") === "0") {
        return undefined as T;
      }
      return (await res.json()) as T;
    },
    [getToken]
  );

  return {
    request,
    get: useCallback(<T,>(path: string) => request<T>(path), [request]),
    post: useCallback(
      <T,>(path: string, body?: unknown) =>
        request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
      [request]
    ),
    patch: useCallback(
      <T,>(path: string, body?: unknown) =>
        request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
      [request]
    ),
  };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public path: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when the API is unreachable or the session is no longer valid. */
  get isAuthFailure() {
    return this.status === 401 || this.status === 403;
  }
}

async function safeMessage(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.detail ?? res.statusText;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}
