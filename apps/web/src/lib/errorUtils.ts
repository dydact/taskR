import { ApiError } from "@dydact/taskr-api-client";

export const resolveErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof ApiError) {
    return err.message ? err.message : `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
};
