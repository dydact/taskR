import { ApiError } from "@dydact/taskr-api-client";
import type { TaskRClient } from "./client";
import { env } from "../config/env";

const API_BASE = env.taskrApiBase;

export type ApiFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
};

export const createApiFetch = (client: TaskRClient) => {
  return async (
    url: string,
    init: RequestInit & { method?: string } = {}
  ): Promise<ApiFetchResponse> => {
    const normalizedBase = API_BASE?.replace(/\/$/, "") ?? "";
    const trimmedUrl = url.startsWith(normalizedBase) ? url.slice(normalizedBase.length) : url;
    const path = trimmedUrl.startsWith("/") ? trimmedUrl : `/${trimmedUrl}`;
    const method = (init.method ?? (init.body ? "POST" : "GET")).toUpperCase() as
      | "GET"
      | "POST"
      | "PATCH"
      | "DELETE";

    let body: unknown = init.body;
    if (body && typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        body = init.body;
      }
    }

    let headers = init.headers as Record<string, string> | undefined;
    if (headers) {
      headers = Object.fromEntries(
        Object.entries(headers).filter(([key]) => {
          const lower = key.toLowerCase();
          return lower !== "x-tenant-id" && lower !== "x-user-id";
        })
      );
    }

    try {
      const data = await client.request<any>({
        path,
        method,
        body,
        signal: init.signal ?? undefined,
        headers
      });
      const toText =
        typeof data === "string" ? data : JSON.stringify(data ?? null, null, 2);
      return {
        ok: true,
        status: 200,
        json: async () => data,
        text: async () => toText
      };
    } catch (err) {
      if (err instanceof ApiError) {
        const toText =
          typeof err.body === "string" ? err.body : JSON.stringify(err.body ?? null, null, 2);
        return {
          ok: false,
          status: err.status,
          json: async () => err.body,
          text: async () => toText
        };
      }
      throw err;
    }
  };
};
