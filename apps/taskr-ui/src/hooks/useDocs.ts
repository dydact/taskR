import { useCallback, useEffect, useMemo, useState } from "react";
import type { Doc } from "@dydact/taskr-api-client";
import { ApiError } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/taskrClient";

type UseDocsOptions = {
  spaceIdentifier?: string | null;
};

export const useDocs = ({ spaceIdentifier }: UseDocsOptions = {}) => {
  const client = useTaskRClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState(0);

  const refresh = useCallback(() => {
    setToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchDocs = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.docs.list({
          spaceIdentifier: spaceIdentifier ?? undefined
        });
        const payload = Array.isArray((response as any)?.data)
          ? (response as { data: Doc[] }).data
          : (response as Doc[]);
        if (!cancelled) {
          setDocs(payload);
        }
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message || `Failed to fetch docs (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setError(message);
        setDocs([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchDocs();

    return () => {
      cancelled = true;
    };
  }, [client, spaceIdentifier, token]);

  const memoDocs = useMemo(() => docs, [docs]);

  return { docs: memoDocs, loading, error, refresh };
};
