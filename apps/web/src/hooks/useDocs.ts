import { useCallback, useEffect, useState } from "react";
import type { Doc, DocRequest, DocRevision, DocRevisionRequest, DocUpdateRequest } from "@dydact/taskr-api-client";
import { useTaskRClient } from "../lib/client";

export type UseDocsOptions = {
  spaceIdentifier?: string;
  listId?: string;
  autoLoad?: boolean;
};

export type UseDocsResult = {
  docs: Doc[];
  loading: boolean;
  error: string | null;
  selectedDoc: Doc | null;
  selectedDocLoading: boolean;
  selectedDocError: string | null;
  revisions: DocRevision[];
  revisionsLoading: boolean;
  revisionsError: string | null;
  refresh: () => Promise<void>;
  selectDoc: (docId: string | null) => Promise<void>;
  createDoc: (payload: DocRequest) => Promise<Doc>;
  updateDoc: (docId: string, payload: DocUpdateRequest) => Promise<Doc>;
  deleteDoc: (docId: string) => Promise<void>;
  createRevision: (docId: string, payload: DocRevisionRequest) => Promise<DocRevision>;
  refreshRevisions: (docId: string) => Promise<void>;
};

export function useDocs(options: UseDocsOptions = {}): UseDocsResult {
  const { spaceIdentifier, listId, autoLoad = true } = options;
  const client = useTaskRClient();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [selectedDocLoading, setSelectedDocLoading] = useState(false);
  const [selectedDocError, setSelectedDocError] = useState<string | null>(null);

  const [revisions, setRevisions] = useState<DocRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.docs.list({ spaceIdentifier, listId });
      const data = Array.isArray(result) ? result : (result as { data?: Doc[] })?.data ?? [];
      setDocs(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [client, spaceIdentifier, listId]);

  const selectDoc = useCallback(
    async (docId: string | null) => {
      if (!docId) {
        setSelectedDoc(null);
        setSelectedDocError(null);
        setRevisions([]);
        return;
      }
      setSelectedDocLoading(true);
      setSelectedDocError(null);
      try {
        const doc = await client.docs.get(docId);
        setSelectedDoc(doc);
        // Also load revisions
        setRevisionsLoading(true);
        setRevisionsError(null);
        try {
          const revs = await client.docs.listRevisions(docId);
          setRevisions(Array.isArray(revs) ? revs : []);
        } catch (revErr) {
          setRevisionsError(revErr instanceof Error ? revErr.message : String(revErr));
          setRevisions([]);
        } finally {
          setRevisionsLoading(false);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setSelectedDocError(message);
        setSelectedDoc(null);
      } finally {
        setSelectedDocLoading(false);
      }
    },
    [client]
  );

  const createDoc = useCallback(
    async (payload: DocRequest): Promise<Doc> => {
      const doc = await client.docs.create(payload);
      await refresh();
      return doc;
    },
    [client, refresh]
  );

  const updateDoc = useCallback(
    async (docId: string, payload: DocUpdateRequest): Promise<Doc> => {
      const doc = await client.docs.update(docId, payload);
      setSelectedDoc(doc);
      await refresh();
      return doc;
    },
    [client, refresh]
  );

  const deleteDoc = useCallback(
    async (docId: string): Promise<void> => {
      await client.docs.remove(docId);
      if (selectedDoc?.doc_id === docId) {
        setSelectedDoc(null);
        setRevisions([]);
      }
      await refresh();
    },
    [client, refresh, selectedDoc]
  );

  const createRevision = useCallback(
    async (docId: string, payload: DocRevisionRequest): Promise<DocRevision> => {
      const revision = await client.docs.createRevision(docId, payload);
      // Refresh revisions list
      const revs = await client.docs.listRevisions(docId);
      setRevisions(Array.isArray(revs) ? revs : []);
      // Also refresh the doc to get updated current_revision_id
      const doc = await client.docs.get(docId);
      setSelectedDoc(doc);
      return revision;
    },
    [client]
  );

  const refreshRevisions = useCallback(
    async (docId: string) => {
      setRevisionsLoading(true);
      setRevisionsError(null);
      try {
        const revs = await client.docs.listRevisions(docId);
        setRevisions(Array.isArray(revs) ? revs : []);
      } catch (err) {
        setRevisionsError(err instanceof Error ? err.message : String(err));
      } finally {
        setRevisionsLoading(false);
      }
    },
    [client]
  );

  useEffect(() => {
    if (autoLoad) {
      void refresh();
    }
  }, [autoLoad, refresh]);

  return {
    docs,
    loading,
    error,
    selectedDoc,
    selectedDocLoading,
    selectedDocError,
    revisions,
    revisionsLoading,
    revisionsError,
    refresh,
    selectDoc,
    createDoc,
    updateDoc,
    deleteDoc,
    createRevision,
    refreshRevisions,
  };
}

export default useDocs;
