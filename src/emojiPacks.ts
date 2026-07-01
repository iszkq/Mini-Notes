export type EmojiPack = {
  id: string;
  name: string;
  itemCount?: number;
};

export type EmojiItem = {
  id: string;
  packId: string;
  packName: string;
  name: string;
  url: string;
  thumbUrl: string;
  keywords: string[];
  animated?: boolean;
};

export type EmojiIndex = {
  packs: EmojiPack[];
  items: EmojiItem[];
};

const EMOJI_INDEX_URL = "/api/emoji-index";

let emojiIndexPromise: Promise<EmojiIndex> | null = null;

export async function loadEmojiIndex(): Promise<EmojiIndex> {
  if (!emojiIndexPromise) {
    emojiIndexPromise = fetch(EMOJI_INDEX_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`表情包加载失败（${response.status}）`);
        }

        const payload = (await response.json()) as Partial<EmojiIndex>;
        const packs = Array.isArray(payload.packs) ? payload.packs : [];
        const items = Array.isArray(payload.items) ? payload.items : [];

        return {
          packs: packs
            .filter((pack): pack is EmojiPack => Boolean(pack?.id && pack?.name))
            .map((pack) => ({
              id: String(pack.id),
              name: String(pack.name),
              itemCount: typeof pack.itemCount === "number" ? pack.itemCount : undefined
            })),
          items: items
            .filter((item): item is EmojiItem => Boolean(item?.id && item?.packId && item?.url))
            .map((item) => ({
              id: String(item.id),
              packId: String(item.packId),
              packName: String(item.packName || item.packId),
              name: String(item.name || item.id),
              url: String(item.url),
              thumbUrl: String(item.thumbUrl || item.url),
              keywords: Array.isArray(item.keywords) ? item.keywords.map(String) : [],
              animated: Boolean(item.animated)
            }))
        };
      })
      .catch((error) => {
        emojiIndexPromise = null;
        throw error;
      });
  }

  return emojiIndexPromise;
}

export function isImageIcon(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\/.+\.(?:png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(value));
}
