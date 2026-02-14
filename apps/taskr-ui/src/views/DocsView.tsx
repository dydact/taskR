import { useCallback, useEffect, useMemo, useState } from "react";
import type { Doc } from "@dydact/taskr-api-client";
import { ApiError } from "@dydact/taskr-api-client";
import { FileText, Loader2, Pencil, Plus, RefreshCcw, Save, X } from "lucide-react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Badge } from "../components/ui/badge";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { cn } from "../components/ui/utils";
import { useDocs } from "../hooks/useDocs";
import { useShell } from "../context/ShellContext";
import { useTaskRClient } from "../lib/taskrClient";
import { slugify } from "../utils/slugify";

const NEW_DOC_ID = "__new__";

type DraftState = {
  title: string;
  summary: string;
  tags: string;
  content: string;
};

const emptyDraft: DraftState = {
  title: "",
  summary: "",
  tags: "",
  content: ""
};

const parseTags = (input: string) =>
  Array.from(new Set(input.split(",").map((tag) => tag.trim()).filter((tag) => tag.length > 0)));

export const DocsView: React.FC = () => {
  const client = useTaskRClient();
  const { spaces, activeSpaceId } = useShell();
  const activeSpace = useMemo(() => spaces.find((space) => space.spaceId === activeSpaceId) ?? null, [spaces, activeSpaceId]);

  const { docs, loading, error, refresh } = useDocs({ spaceIdentifier: activeSpace?.slug });
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Doc | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(emptyDraft);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (docs.length === 0) {
      setSelectedId((prev) => (prev === NEW_DOC_ID ? prev : null));
      return;
    }
    if (selectedId && selectedId !== NEW_DOC_ID) {
      const exists = docs.some((doc) => doc.doc_id === selectedId);
      if (!exists) {
        setSelectedId(docs[0].doc_id);
      }
    } else if (!selectedId) {
      setSelectedId(docs[0].doc_id);
    }
  }, [docs, selectedId]);

  const selectedDocIsNew = selectedId === NEW_DOC_ID;

  const resetDraftFromDoc = useCallback((doc: Doc | null) => {
    if (!doc) {
      setDraft(emptyDraft);
      return;
    }
    setDraft({
      title: doc.title,
      summary: doc.summary ?? "",
      tags: (doc.tags ?? []).join(", "),
      content: doc.content ?? ""
    });
  }, []);

  const fetchDocDetail = useCallback(
    async (docId: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await client.docs.get(docId);
        setDetail(data);
        resetDraftFromDoc(data);
        setIsEditing(false);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message || `Failed to load document (HTTP ${err.status})`
            : err instanceof Error
            ? err.message
            : String(err);
        setDetailError(message);
        setDetail(null);
        resetDraftFromDoc(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [client, resetDraftFromDoc]
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      resetDraftFromDoc(null);
      setIsEditing(false);
      return;
    }
    if (selectedId === NEW_DOC_ID) {
      setDetail(null);
      resetDraftFromDoc({ ...emptyDraft, title: "Untitled document" });
      setIsEditing(true);
      return;
    }
    void fetchDocDetail(selectedId);
  }, [selectedId, fetchDocDetail, resetDraftFromDoc]);

  const filteredDocs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return docs;
    return docs.filter((doc) => doc.title.toLowerCase().includes(term) || (doc.summary ?? "").toLowerCase().includes(term));
  }, [docs, search]);

  const handleSelectDoc = (docId: string) => {
    setSelectedId(docId);
  };

  const handleCreateDoc = () => {
    setSelectedId(NEW_DOC_ID);
  };

  const handleCancelEditing = () => {
    if (selectedDocIsNew) {
      setSelectedId(docs.length > 0 ? docs[0].doc_id : null);
    } else {
      resetDraftFromDoc(detail);
      setIsEditing(false);
    }
  };

  const handleSave = async () => {
    const spaceId = activeSpace?.spaceId ?? null;
    const tags = parseTags(draft.tags);
    const title = draft.title.trim() || "Untitled document";

    try {
      setSaving(true);
      if (selectedDocIsNew) {
        const created = await client.docs.create({
          title,
          slug: slugify(title),
          summary: draft.summary?.trim() || undefined,
          tags,
          space_id: spaceId || undefined,
          text: draft.content
        });
        setSelectedId(created.doc_id);
        setDetail(created);
        resetDraftFromDoc(created);
        setIsEditing(false);
        refresh();
        return;
      }

      if (!detail) {
        return;
      }

      const updates: Record<string, unknown> = {};
      if (title !== detail.title) updates.title = title;
      if ((draft.summary ?? "").trim() !== (detail.summary ?? "")) updates.summary = draft.summary?.trim() ?? "";

      const currentTags = Array.from(new Set(detail.tags ?? [])).sort().join("|");
      const nextTags = Array.from(tags).sort().join("|");
      if (currentTags !== nextTags) {
        updates.tags = tags;
      }

      if (Object.keys(updates).length > 0) {
        await client.docs.update(detail.doc_id, updates);
      }

      if ((draft.content ?? "") !== (detail.content ?? "")) {
        await client.docs.createRevision(detail.doc_id, {
          text: draft.content,
          title
        });
      }

      const updated = await client.docs.get(detail.doc_id);
      setDetail(updated);
      resetDraftFromDoc(updated);
      setIsEditing(false);
      refresh();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message || `Failed to save document (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : String(err);
      setDetailError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    refresh();
    if (selectedId && selectedId !== NEW_DOC_ID) {
      void fetchDocDetail(selectedId);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6rem)] rounded-xl border border-slate-200 overflow-hidden bg-white">
      <aside className="w-72 border-r border-slate-200 flex flex-col bg-slate-50">
        <div className="p-4 border-b border-slate-200">
          <Button onClick={handleCreateDoc} className="w-full justify-center gap-2">
            <Plus className="h-4 w-4" />
            New Document
          </Button>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents"
            className="mt-3"
          />
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 text-sm text-slate-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-red-500">{error}</div>
          ) : filteredDocs.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No documents yet. Create your first document to get started.</div>
          ) : (
            <ul className="py-2">
              {filteredDocs.map((doc) => (
                <li key={doc.doc_id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-slate-100 transition border-l-2",
                      selectedId === doc.doc_id ? "border-slate-900 bg-white" : "border-transparent"
                    )}
                    onClick={() => handleSelectDoc(doc.doc_id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm text-slate-900 truncate">{doc.title}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(doc.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    {doc.summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{doc.summary}</p>}
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                        {doc.tags.length > 3 && <span className="text-[10px] text-slate-500">+{doc.tags.length - 3}</span>}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </aside>
      <section className="flex-1 flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-white">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Knowledge Documents</h2>
            <p className="text-sm text-slate-500">
              {activeSpace ? `Space · ${activeSpace.name}` : "All spaces"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-2">
              <RefreshCcw className="h-4 w-4" /> Refresh
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {detailLoading ? (
            <div className="h-full flex items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading document…
            </div>
          ) : selectedDocIsNew || detail ? (
            <DocumentPanel
              draft={draft}
              setDraft={setDraft}
              onCancel={handleCancelEditing}
              onSave={handleSave}
              saving={saving}
              isEditing={isEditing}
              setIsEditing={setIsEditing}
              detail={selectedDocIsNew ? null : detail}
              detailError={detailError}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500">
              <div className="text-center max-w-sm px-6">
                <FileText className="mx-auto mb-4 text-slate-300" size={56} />
                <p className="font-medium text-slate-700 mb-2">Select a document to get started</p>
                <p className="text-sm">Choose an existing document from the list or create a new one for this space.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

type DocumentPanelProps = {
  draft: DraftState;
  setDraft: React.Dispatch<React.SetStateAction<DraftState>>;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
  saving: boolean;
  isEditing: boolean;
  setIsEditing: (value: boolean) => void;
  detail: Doc | null;
  detailError: string | null;
};

const DocumentPanel: React.FC<DocumentPanelProps> = ({
  draft,
  setDraft,
  onSave,
  onCancel,
  saving,
  isEditing,
  setIsEditing,
  detail,
  detailError
}) => {
  const activeTab = isEditing ? "edit" : "view";

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-slate-200 bg-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <Input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                className="text-lg font-semibold"
                placeholder="Document title"
              />
            ) : (
              <h1 className="text-xl font-semibold text-slate-900 truncate">{draft.title || "Untitled document"}</h1>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
              <span>{detail ? new Date(detail.updated_at).toLocaleString() : "Not yet saved"}</span>
              {detail?.current_revision_version && (
                <>
                  <Separator orientation="vertical" className="h-3" />
                  <span>Revision {detail.current_revision_version}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
                <Button onClick={() => void onSave()} size="sm" className="gap-2" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </Button>
                <Badge className={`text-[11px] ${saving ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600"} border-0`}>
                  {saving ? "Saving…" : "Draft ready"}
                </Badge>
              </>
            ) : (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
          </div>
        </div>
        {detailError && <p className="mt-2 text-sm text-red-500">{detailError}</p>}
      </div>
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
        <Tabs value={activeTab} onValueChange={(value) => setIsEditing(value === "edit")}
          className="w-fit">
          <TabsList className="h-8 bg-white">
            <TabsTrigger value="view" className="text-xs">Read</TabsTrigger>
            <TabsTrigger value="edit" className="text-xs">Edit</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} className="h-full">
          <TabsContent value="view" className="h-full">
            <ScrollArea className="h-full">
              <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
                {draft.summary && (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700 mb-2">Summary</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{draft.summary}</p>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-medium text-slate-700 mb-2">Content</h3>
                  <div className="prose prose-sm max-w-none text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {draft.content || <span className="text-slate-400">No content yet.</span>}
                  </div>
                </div>
                {draft.tags && (
                  <div className="flex flex-wrap gap-2">
                    {parseTags(draft.tags).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="edit" className="h-full">
            <ScrollArea className="h-full">
              <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Summary</label>
                  <Textarea
                    value={draft.summary}
                    onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
                    placeholder="Brief summary for quick reference"
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Content</label>
                  <Textarea
                    value={draft.content}
                    onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
                    placeholder="Write or paste your document content here"
                    className="min-h-[320px]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Tags</label>
                  <Input
                    value={draft.tags}
                    onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))}
                    placeholder="research, ai, release"
                  />
                  <p className="text-xs text-slate-500">Separate tags with commas for easier filtering.</p>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
