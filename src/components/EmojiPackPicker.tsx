import clsx from "clsx";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { loadEmojiIndex, type EmojiIndex, type EmojiItem } from "../emojiPacks";
import { useDialogFocus } from "./useDialogFocus";

type EmojiPackPickerProps = {
  open: boolean;
  title: string;
  confirmLabel?: string;
  onClose: () => void;
  onSelect: (item: EmojiItem) => void;
};

const MAX_VISIBLE_ITEMS = 120;

export function EmojiPackPicker({
  open,
  title,
  confirmLabel = "选择",
  onClose,
  onSelect
}: EmojiPackPickerProps) {
  const [data, setData] = useState<EmojiIndex | null>(null);
  const [activePackId, setActivePackId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useDialogFocus(open, onClose);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void loadEmojiIndex()
      .then((nextData) => {
        if (cancelled) {
          return;
        }

        setData(nextData);
        setActivePackId((current) => current || nextData.packs[0]?.id || "");
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "表情包加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const visibleItems = useMemo(() => {
    if (!data) {
      return [];
    }

    const term = query.trim().toLowerCase();
    const baseItems = term
      ? data.items
      : data.items.filter((item) => item.packId === activePackId);

    return baseItems
      .filter((item) => {
        if (!term) {
          return true;
        }

        const haystack = [item.name, item.packName, item.packId, ...item.keywords]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, MAX_VISIBLE_ITEMS);
  }, [activePackId, data, query]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="emoji-picker-mask" onClick={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="emoji-picker"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="emoji-picker__header">
          <div>
            <strong>{title}</strong>
            <p>从表情包里选择一个图片表情。</p>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </header>

        <label className="search-box emoji-picker__search">
          <Search size={16} />
          <input
            data-dialog-initial-focus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索表情"
            value={query}
          />
        </label>

        {data && !query.trim() ? (
          <div className="emoji-picker__packs" role="group" aria-label="表情包分类">
            {data.packs.map((pack) => (
              <button
                aria-pressed={activePackId === pack.id}
                className={clsx("emoji-picker__pack", activePackId === pack.id && "active")}
                key={pack.id}
                onClick={() => setActivePackId(pack.id)}
                type="button"
              >
                <span>{pack.name}</span>
                {pack.itemCount ? <small>{pack.itemCount}</small> : null}
              </button>
            ))}
          </div>
        ) : null}

        <div className="emoji-picker__body">
          {loading ? <div className="emoji-picker__state">正在加载表情包...</div> : null}
          {!loading && error ? <div className="emoji-picker__state is-error">{error}</div> : null}
          {!loading && !error && visibleItems.length === 0 ? (
            <div className="emoji-picker__state">没有找到匹配的表情。</div>
          ) : null}

          {!loading && !error && visibleItems.length > 0 ? (
            <div className="emoji-picker__grid">
              {visibleItems.map((item) => (
                <button
                  className="emoji-picker__item"
                  key={item.id}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  title={`${confirmLabel}：${item.name}`}
                  type="button"
                >
                  <img alt={item.name} loading="lazy" src={item.thumbUrl} />
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>,
    document.body
  );
}
