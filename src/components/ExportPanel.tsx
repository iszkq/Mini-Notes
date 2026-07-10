import clsx from "clsx";
import { Download, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { NoteSummary } from "../shared";
import { NoteIcon } from "./NoteIcon";
import { useDialogFocus } from "./useDialogFocus";

type ExportPanelProps = {
  notes: NoteSummary[];
  open: boolean;
  pending: boolean;
  selectedIds: string[];
  onClear: () => void;
  onClose: () => void;
  onExportPdf: () => void;
  onSelectAll: () => void;
  onSelectVisible: (ids: string[]) => void;
  onToggleNote: (id: string) => void;
};

export function ExportPanel({
  notes,
  open,
  pending,
  selectedIds,
  onClear,
  onClose,
  onExportPdf,
  onSelectAll,
  onSelectVisible,
  onToggleNote
}: ExportPanelProps) {
  const [query, setQuery] = useState("");
  const dialogRef = useDialogFocus(open, onClose);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const filteredNotes = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return notes;
    }

    return notes.filter((note) => note.title.toLowerCase().includes(term));
  }, [notes, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <button
        aria-label="关闭导出面板"
        className="export-panel-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />

      <section
        aria-label="批量导出"
        aria-modal="true"
        className="export-panel"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="export-panel-head">
          <div>
            <strong>批量导出</strong>
            <p>勾选页面后，直接打开打印面板导出 PDF。</p>
          </div>

          <div className="export-panel-actions-top">
            <span className="export-format-badge">PDF</span>
            <button
              aria-label="关闭导出面板"
              className="icon-button"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        <div className="export-panel-toolbar">
          <label className="search-box export-search-box">
            <Search size={16} />
            <input
              data-dialog-initial-focus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索要导出的页面"
              value={query}
            />
          </label>

          <div className="export-panel-pills">
            <span className="export-count-pill">已选 {selectedIds.length} / {notes.length}</span>
            <button
              className="toolbar-button"
              disabled={filteredNotes.length === 0}
              onClick={() => onSelectVisible(filteredNotes.map((note) => note.id))}
              type="button"
            >
              全选当前列表
            </button>
            <button
              className="toolbar-button"
              disabled={notes.length === 0}
              onClick={onSelectAll}
              type="button"
            >
              全选全部
            </button>
            <button
              className="toolbar-button"
              disabled={selectedIds.length === 0}
              onClick={onClear}
              type="button"
            >
              清空
            </button>
          </div>
        </div>

        <div className="export-note-list" role="list">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => {
              const checked = selectedSet.has(note.id);
              return (
                <label
                  className={clsx("export-note-row", checked && "selected")}
                  key={note.id}
                >
                  <input
                    checked={checked}
                    onChange={() => onToggleNote(note.id)}
                    type="checkbox"
                  />
                  <NoteIcon className="note-icon export-note-icon" icon={note.icon} />
                  <span className="export-note-copy">
                    <strong>{note.title}</strong>
                    <small>更新于 {formatNoteTime(note.updatedAt)}</small>
                  </span>
                </label>
              );
            })
          ) : (
            <div className="export-empty">没有匹配的页面。</div>
          )}
        </div>

        <footer className="export-panel-footer">
          <button
            className="primary-button export-submit-button"
            disabled={pending || selectedIds.length === 0}
            onClick={onExportPdf}
            type="button"
          >
            <Download size={16} />
            {pending ? "准备中" : "导出 PDF"}
          </button>
        </footer>
      </section>
    </>,
    document.body
  );
}

function formatNoteTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
