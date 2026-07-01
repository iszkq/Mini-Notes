export type BibleVerse = {
  id: string;
  covenant: "old" | "new";
  covenantLabel: string;
  bookName: string;
  chapterNumber: number;
  verseNumber: number;
  content: string;
  order: number;
};

export type BibleData = {
  booksByCovenant: Record<"old" | "new", string[]>;
  chaptersByBook: Record<string, number[]>;
  verses: BibleVerse[];
};

let bibleDataPromise: Promise<BibleData> | null = null;
const bibleChapterPromises = new Map<string, Promise<BibleVerse[]>>();
const bibleSearchPromises = new Map<string, Promise<BibleVerse[]>>();

export async function loadBibleData(): Promise<BibleData> {
  if (!bibleDataPromise) {
    bibleDataPromise = requestBibleJson<Omit<BibleData, "verses">>("/api/bible")
      .then((data) => ({ ...data, verses: [] }))
      .catch((error) => {
        bibleDataPromise = null;
        throw error;
      });
  }

  return bibleDataPromise;
}

export async function loadBibleChapter(bookName: string, chapterNumber: number): Promise<BibleVerse[]> {
  const key = `${bookName}:${chapterNumber}`;

  if (!bibleChapterPromises.has(key)) {
    const params = new URLSearchParams({
      book: bookName,
      chapter: String(chapterNumber)
    });
    const promise = requestBibleJson<{ verses: BibleVerse[] }>(`/api/bible/chapter?${params}`)
      .then((data) => data.verses)
      .catch((error) => {
        bibleChapterPromises.delete(key);
        throw error;
      });
    bibleChapterPromises.set(key, promise);
  }

  return bibleChapterPromises.get(key)!;
}

export async function searchBibleRemote(keyword: string): Promise<BibleVerse[]> {
  const query = keyword.trim();
  if (!query) {
    return [];
  }

  const key = query.toLowerCase();
  if (!bibleSearchPromises.has(key)) {
    const params = new URLSearchParams({ q: query });
    const promise = requestBibleJson<{ verses: BibleVerse[] }>(`/api/bible/search?${params}`)
      .then((data) => data.verses)
      .catch((error) => {
        bibleSearchPromises.delete(key);
        throw error;
      });
    bibleSearchPromises.set(key, promise);
  }

  return bibleSearchPromises.get(key)!;
}

export function sortBibleVerses(verses: BibleVerse[]): BibleVerse[] {
  return [...verses].sort((left, right) => left.order - right.order);
}

export function searchBibleVerses(verses: BibleVerse[], keyword: string): BibleVerse[] {
  const tokens = keyword
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return [];
  }

  return verses.filter((verse) => {
    const haystack =
      `${verse.bookName} ${verse.chapterNumber}:${verse.verseNumber} ${verse.content}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function formatBibleReference(verse: Pick<BibleVerse, "bookName" | "chapterNumber" | "verseNumber">): string {
  return `【${verse.bookName} ${verse.chapterNumber}:${verse.verseNumber}】`;
}

export function formatBiblePlainText(verse: BibleVerse): string {
  return `${formatBibleReference(verse)}${verse.content}`;
}

export function formatBiblePageText(verses: BibleVerse[]): string {
  return verses.map(formatBiblePlainText).join("\n");
}

export function serializeBibleVerses(verses: BibleVerse[]): string {
  return JSON.stringify(
    verses.map((verse) => ({
      id: verse.id,
      covenant: verse.covenant,
      covenantLabel: verse.covenantLabel,
      bookName: verse.bookName,
      chapterNumber: verse.chapterNumber,
      verseNumber: verse.verseNumber,
      content: verse.content,
      order: verse.order
    }))
  );
}

export function parseBibleVersePayload(payload: string): BibleVerse[] {
  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const verse = item as Partial<BibleVerse>;
        return {
          id: typeof verse.id === "string" ? verse.id : `verse-${index}`,
          covenant: verse.covenant === "new" ? "new" : "old",
          covenantLabel: typeof verse.covenantLabel === "string" ? verse.covenantLabel : "",
          bookName: typeof verse.bookName === "string" ? verse.bookName : "",
          chapterNumber:
            typeof verse.chapterNumber === "number" ? verse.chapterNumber : Number(verse.chapterNumber ?? 0),
          verseNumber:
            typeof verse.verseNumber === "number" ? verse.verseNumber : Number(verse.verseNumber ?? 0),
          content: typeof verse.content === "string" ? verse.content : "",
          order: typeof verse.order === "number" ? verse.order : index
        } satisfies BibleVerse;
      })
      .filter((verse) => Boolean(verse.bookName && verse.chapterNumber && verse.verseNumber));
  } catch {
    return [];
  }
}

export function parseBibleCsv(input: string): BibleData {
  const lines = input.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  const verses: BibleVerse[] = [];
  const booksByCovenant: Record<"old" | "new", string[]> = { old: [], new: [] };
  const chaptersByBook = new Map<string, Set<number>>();

  for (const [lineIndex, line] of lines.slice(1).entries()) {
    const parts = splitBibleCsvLine(line);
    if (parts.length < 7) {
      continue;
    }

    const covenantLabel = parts[0]?.trim() ?? "";
    const covenant = covenantLabel.includes("新") ? "new" : "old";
    const bookName = parts[2]?.trim() ?? "";
    const chapterNumber = Number(parts[4]?.trim() ?? 0);
    const verseNumber = Number(parts[5]?.trim() ?? 0);
    const content = parts.slice(6).join(",").trim();

    if (!bookName || !chapterNumber || !verseNumber || !content) {
      continue;
    }

    if (!booksByCovenant[covenant].includes(bookName)) {
      booksByCovenant[covenant].push(bookName);
    }

    const chapters = chaptersByBook.get(bookName) ?? new Set<number>();
    chapters.add(chapterNumber);
    chaptersByBook.set(bookName, chapters);

    verses.push({
      id: `${bookName}-${chapterNumber}-${verseNumber}-${lineIndex}`,
      covenant,
      covenantLabel,
      bookName,
      chapterNumber,
      verseNumber,
      content,
      order: verses.length
    });
  }

  return {
    booksByCovenant,
    chaptersByBook: Object.fromEntries(
      [...chaptersByBook.entries()].map(([bookName, chapters]) => [
        bookName,
        [...chapters].sort((left, right) => left - right)
      ])
    ),
    verses
  };
}

async function requestBibleJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    const fallback = `经文数据加载失败（${response.status}）`;
    let message = fallback;
    try {
      const payload = (await response.json()) as { error?: unknown };
      if (typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      // Keep the status-based fallback when the response is not JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function splitBibleCsvLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}
