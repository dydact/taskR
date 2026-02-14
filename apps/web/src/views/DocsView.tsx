import React, { useCallback, useMemo, useState } from "react";
import type { DocRequest, DocRevision, DocUpdateRequest } from "@dydact/taskr-api-client";
import { useDocs } from "../hooks/useDocs";
import { useShell } from "../context/ShellContext";
import { slugify } from "../utils/slugify";

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const formatDateTime = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return dateTimeFmt.format(d);
};

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const DocIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
    <polyline points="14,2 14,8 20,8" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const SaveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const TagIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

type DocFormState = {
  title: string;
  summary: string;
  content: string;
  tags: string;
};

const emptyFormState: DocFormState = {
  title: "",
  summary: "",
  content: "",
  tags: "",
};

export const DocsView: React.FC = () => {
  const { activeSpaceId, spaces } = useShell();
  const activeSpace = useMemo(
    () => spaces.find((s) => s.spaceId === activeSpaceId || s.id === activeSpaceId),
    [spaces, activeSpaceId]
  );

  const {
    docs,
    loading,
    error,
    selectedDoc,
    selectedDocLoading,
    selectedDocError,
    revisions,
    revisionsLoading,
    refresh,
    selectDoc,
    createDoc,
    updateDoc,
    deleteDoc,
    createRevision,
  } = useDocs({ spaceIdentifier: activeSpace?.slug });

  const [searchQuery, setSearchQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [formState, setFormState] = useState<DocFormState>(emptyFormState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs;
    const query = searchQuery.toLowerCase();
    return docs.filter(
      (doc) =>
        doc.title.toLowerCase().includes(query) ||
        doc.summary?.toLowerCase().includes(query) ||
        doc.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [docs, searchQuery]);

  const handleSelectDoc = useCallback(
    async (docId: string) => {
      setEditMode(false);
      setShowRevisions(false);
      setIsCreating(false);
      setSaveError(null);
      await selectDoc(docId);
    },
    [selectDoc]
  );

  const handleNewDoc = useCallback(() => {
    setIsCreating(true);
    setEditMode(true);
    setShowRevisions(false);
    setSaveError(null);
    setFormState(emptyFormState);
    void selectDoc(null);
  }, [selectDoc]);

  const handleEdit = useCallback(() => {
    if (!selectedDoc) return;
    setFormState({
      title: selectedDoc.title,
      summary: selectedDoc.summary ?? "",
      content: selectedDoc.content ?? "",
      tags: selectedDoc.tags.join(", "),
    });
    setEditMode(true);
    setSaveError(null);
  }, [selectedDoc]);

  const handleCancelEdit = useCallback(() => {
    setEditMode(false);
    setIsCreating(false);
    setSaveError(null);
    if (selectedDoc) {
      setFormState({
        title: selectedDoc.title,
        summary: selectedDoc.summary ?? "",
        content: selectedDoc.content ?? "",
        tags: selectedDoc.tags.join(", "),
      });
    } else {
      setFormState(emptyFormState);
    }
  }, [selectedDoc]);

  const handleSave = useCallback(async () => {
    if (!formState.title.trim()) {
      setSaveError("Title is required");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const tagsArray = formState.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (isCreating) {
        const payload: DocRequest = {
          title: formState.title.trim(),
          slug: slugify(formState.title),
          summary: formState.summary.trim() || null,
          tags: tagsArray,
          space_id: activeSpaceId || undefined,
          text: formState.content.trim() || null,
        };
        const newDoc = await createDoc(payload);
        await selectDoc(newDoc.doc_id);
        setIsCreating(false);
      } else if (selectedDoc) {
        const updatePayload: DocUpdateRequest = {
          title: formState.title.trim(),
          summary: formState.summary.trim() || null,
          tags: tagsArray,
        };
        await updateDoc(selectedDoc.doc_id, updatePayload);
        // If content changed, create a new revision
        if (formState.content !== (selectedDoc.content ?? "")) {
          await createRevision(selectedDoc.doc_id, {
            text: formState.content.trim() || null,
            title: formState.title.trim(),
          });
        }
      }
      setEditMode(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    formState,
    isCreating,
    selectedDoc,
    activeSpaceId,
    createDoc,
    updateDoc,
    createRevision,
    selectDoc,
  ]);

  const handleDelete = useCallback(async () => {
    if (!selectedDoc) return;
    if (!window.confirm(`Delete "${selectedDoc.title}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteDoc(selectedDoc.doc_id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedDoc, deleteDoc]);

  const handleFormChange = useCallback(
    (field: keyof DocFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormState((prev) => ({ ...prev, [field]: e.target.value }));
    },
    []
  );

  const handleRevisionSelect = useCallback(
    (revision: DocRevision) => {
      setFormState((prev) => ({
        ...prev,
        content: revision.content ?? revision.plain_text ?? "",
        title: revision.title || prev.title,
      }));
      setShowRevisions(false);
      setEditMode(true);
    },
    []
  );

  return (
    <div className="docs-view">
      {/* Sidebar */}
      <aside className="docs-sidebar glass-surface">
        <div className="docs-sidebar__header">
          <h2 className="docs-sidebar__title">Documents</h2>
          <button
            type="button"
            className="docs-sidebar__new-btn"
            onClick={handleNewDoc}
            title="New Document"
          >
            <PlusIcon />
          </button>
        </div>

        <div className="docs-sidebar__search">
          <span className="docs-sidebar__search-icon">
            <SearchIcon />
          </span>
          <input
            type="search"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="docs-sidebar__search-input"
          />
        </div>

        <div className="docs-sidebar__list">
          {loading && <div className="docs-sidebar__loading">Loading...</div>}
          {error && <div className="docs-sidebar__error">{error}</div>}
          {!loading && !error && filteredDocs.length === 0 && (
            <div className="docs-sidebar__empty">
              {searchQuery ? "No documents match your search" : "No documents yet"}
            </div>
          )}
          {filteredDocs.map((doc) => (
            <button
              key={doc.doc_id}
              type="button"
              className={`docs-sidebar__item ${
                selectedDoc?.doc_id === doc.doc_id ? "docs-sidebar__item--active" : ""
              }`}
              onClick={() => void handleSelectDoc(doc.doc_id)}
            >
              <span className="docs-sidebar__item-icon">
                <DocIcon />
              </span>
              <div className="docs-sidebar__item-content">
                <span className="docs-sidebar__item-title">{doc.title}</span>
                <span className="docs-sidebar__item-meta">
                  {formatDateTime(doc.updated_at)}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="docs-sidebar__footer">
          <button type="button" className="docs-sidebar__refresh" onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
      </aside>

      {/* Editor Panel */}
      <main className="docs-editor glass-surface">
        {selectedDocLoading && (
          <div className="docs-editor__loading">Loading document...</div>
        )}

        {selectedDocError && (
          <div className="docs-editor__error">{selectedDocError}</div>
        )}

        {!selectedDoc && !isCreating && !selectedDocLoading && (
          <div className="docs-editor__empty">
            <DocIcon />
            <p>Select a document or create a new one</p>
            <button type="button" className="docs-editor__empty-btn" onClick={handleNewDoc}>
              <PlusIcon /> New Document
            </button>
          </div>
        )}

        {(selectedDoc || isCreating) && !selectedDocLoading && (
          <>
            <header className="docs-editor__header">
              <div className="docs-editor__header-left">
                {editMode ? (
                  <input
                    type="text"
                    className="docs-editor__title-input"
                    placeholder="Document title"
                    value={formState.title}
                    onChange={handleFormChange("title")}
                  />
                ) : (
                  <h1 className="docs-editor__title">{selectedDoc?.title}</h1>
                )}
                {!editMode && selectedDoc && (
                  <p className="docs-editor__meta">
                    Updated {formatDateTime(selectedDoc.updated_at)}
                    {selectedDoc.current_revision_version != null && (
                      <span> | v{selectedDoc.current_revision_version}</span>
                    )}
                  </p>
                )}
              </div>

              <div className="docs-editor__header-actions">
                {editMode ? (
                  <>
                    <button
                      type="button"
                      className="docs-editor__btn docs-editor__btn--secondary"
                      onClick={handleCancelEdit}
                      disabled={saving}
                    >
                      <CloseIcon /> Cancel
                    </button>
                    <button
                      type="button"
                      className="docs-editor__btn docs-editor__btn--primary"
                      onClick={() => void handleSave()}
                      disabled={saving}
                    >
                      <SaveIcon /> {saving ? "Saving..." : "Save"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="docs-editor__btn docs-editor__btn--secondary"
                      onClick={() => setShowRevisions(!showRevisions)}
                      title="View revisions"
                    >
                      <HistoryIcon /> Revisions
                    </button>
                    <button
                      type="button"
                      className="docs-editor__btn docs-editor__btn--secondary"
                      onClick={handleDelete}
                      title="Delete document"
                    >
                      <TrashIcon /> Delete
                    </button>
                    <button
                      type="button"
                      className="docs-editor__btn docs-editor__btn--primary"
                      onClick={handleEdit}
                    >
                      <EditIcon /> Edit
                    </button>
                  </>
                )}
              </div>
            </header>

            {saveError && (
              <div className="docs-editor__save-error">{saveError}</div>
            )}

            <div className="docs-editor__body">
              {editMode ? (
                <div className="docs-editor__form">
                  <div className="docs-editor__field">
                    <label className="docs-editor__label">Summary</label>
                    <input
                      type="text"
                      className="docs-editor__input"
                      placeholder="Brief summary..."
                      value={formState.summary}
                      onChange={handleFormChange("summary")}
                    />
                  </div>

                  <div className="docs-editor__field">
                    <label className="docs-editor__label">Tags</label>
                    <input
                      type="text"
                      className="docs-editor__input"
                      placeholder="tag1, tag2, tag3"
                      value={formState.tags}
                      onChange={handleFormChange("tags")}
                    />
                  </div>

                  <div className="docs-editor__field docs-editor__field--content">
                    <label className="docs-editor__label">Content</label>
                    <textarea
                      className="docs-editor__textarea"
                      placeholder="Write your document content here..."
                      value={formState.content}
                      onChange={handleFormChange("content")}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {selectedDoc?.summary && (
                    <p className="docs-editor__summary">{selectedDoc.summary}</p>
                  )}

                  {selectedDoc?.tags && selectedDoc.tags.length > 0 && (
                    <div className="docs-editor__tags">
                      {selectedDoc.tags.map((tag) => (
                        <span key={tag} className="docs-editor__tag">
                          <TagIcon /> {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="docs-editor__content">
                    {selectedDoc?.content ? (
                      <pre className="docs-editor__content-text">{selectedDoc.content}</pre>
                    ) : (
                      <p className="docs-editor__content-empty">No content yet</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Revisions Panel */}
            {showRevisions && !editMode && (
              <aside className="docs-revisions">
                <header className="docs-revisions__header">
                  <h3 className="docs-revisions__title">Revision History</h3>
                  <button
                    type="button"
                    className="docs-revisions__close"
                    onClick={() => setShowRevisions(false)}
                  >
                    <CloseIcon />
                  </button>
                </header>
                <div className="docs-revisions__list">
                  {revisionsLoading && (
                    <div className="docs-revisions__loading">Loading...</div>
                  )}
                  {!revisionsLoading && revisions.length === 0 && (
                    <div className="docs-revisions__empty">No revisions yet</div>
                  )}
                  {revisions.map((rev) => (
                    <button
                      key={rev.revision_id}
                      type="button"
                      className="docs-revisions__item"
                      onClick={() => handleRevisionSelect(rev)}
                    >
                      <span className="docs-revisions__item-version">v{rev.version}</span>
                      <span className="docs-revisions__item-title">{rev.title}</span>
                      <span className="docs-revisions__item-date">
                        {formatDateTime(rev.created_at)}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default DocsView;
