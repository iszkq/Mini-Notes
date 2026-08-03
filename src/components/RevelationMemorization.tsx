import { BookOpen, Check, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BibleData, type BibleVerse, loadBibleChapter, loadBibleData, sortBibleVerses } from "../bible";

type RevelationMemorizationProps = {
  onError?: (message: string) => void;
};

type ChapterChoice = "all" | number;

type BlankChunk =
  | { kind: "text"; value: string }
  | { answer: string; id: string; kind: "blank" };

type ExerciseVerse = {
  chunks: BlankChunk[];
  verse: BibleVerse;
};

type Grade = {
  correct: number;
  total: number;
};

const REVELATION_BOOK_NAME = "启示录";

export function RevelationMemorization({ onError }: RevelationMemorizationProps) {
  const [data, setData] = useState<BibleData | null>(null);
  const [bookName, setBookName] = useState("");
  const [chapter, setChapter] = useState<ChapterChoice>("all");
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [exercise, setExercise] = useState<ExerciseVerse[]>([]);
  const [grade, setGrade] = useState<Grade | null>(null);
  const requestIdRef = useRef(0);

  const chapters = useMemo(
    () => (bookName ? data?.chaptersByBook[bookName] ?? [] : []),
    [bookName, data]
  );
  const blankCount = useMemo(
    () => exercise.reduce((count, item) => count + item.chunks.filter((chunk) => chunk.kind === "blank").length, 0),
    [exercise]
  );

  const generateExercise = useCallback((nextVerses: BibleVerse[]) => {
    setExercise(nextVerses.map((verse) => createExerciseVerse(verse)));
    setAnswers({});
    setGrade(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void loadBibleData()
      .then((nextData) => {
        if (cancelled) return;
        const nextBookName = nextData.booksByCovenant.new.find((book) => book === REVELATION_BOOK_NAME) ?? "";
        if (!nextBookName) throw new Error("未在读经数据中找到启示录。");
        setData(nextData);
        setBookName(nextBookName);
      })
      .catch((error) => {
        if (!cancelled) onError?.(error instanceof Error ? error.message : "默写题库加载失败。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    if (!bookName) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setVerses([]);
    setExercise([]);
    setAnswers({});
    setGrade(null);

    const chapterNumbers = chapter === "all" ? chapters : [chapter];
    void Promise.all(chapterNumbers.map((chapterNumber) => loadBibleChapter(bookName, chapterNumber)))
      .then((loadedChapters) => {
        if (requestId !== requestIdRef.current) return;
        const nextVerses = sortBibleVerses(loadedChapters.flat());
        setVerses(nextVerses);
        generateExercise(nextVerses);
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) {
          onError?.(error instanceof Error ? error.message : "默写题目加载失败。");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [bookName, chapter, chapters, generateExercise, onError]);

  const checkAnswers = useCallback(() => {
    if (blankCount === 0) return;
    const correct = exercise.reduce(
      (count, item) =>
        count +
        item.chunks.filter(
          (chunk) => chunk.kind === "blank" && normalizeAnswer(answers[chunk.id] ?? "") === normalizeAnswer(chunk.answer)
        ).length,
      0
    );
    setGrade({ correct, total: blankCount });
  }, [answers, blankCount, exercise]);

  const resetExercise = useCallback(() => generateExercise(verses), [generateExercise, verses]);
  const gradePercent = grade && grade.total > 0 ? ((grade.correct / grade.total) * 100).toFixed(1) : null;

  return (
    <section className="revelation-memorization-page" aria-busy={loading}>
      <header className="revelation-memorization-hero">
        <div>
          <span className="revelation-memorization-eyebrow"><BookOpen size={15} />启示录学习</span>
          <h1>启示录背诵默写</h1>
          <p>根据经文随机生成挖空题，完成后可立即查看答案与正确率。</p>
        </div>
        <div className="revelation-memorization-stat"><strong>{loading ? "…" : blankCount}</strong><span>本次填空</span></div>
      </header>

      <div className="revelation-memorization-controls">
        <label>
          <span>选择章节</span>
          <select disabled={loading || chapters.length === 0} onChange={(event) => setChapter(event.target.value === "all" ? "all" : Number(event.target.value))} value={chapter}>
            <option value="all">全卷（1–22章）</option>
            {chapters.map((item) => <option key={item} value={item}>第 {item} 章</option>)}
          </select>
        </label>
        <div className="revelation-memorization-actions">
          <button className="toolbar-button" disabled={loading || verses.length === 0} onClick={resetExercise} type="button"><RefreshCw size={16} />生成新题</button>
          <button className="primary-button" disabled={loading || blankCount === 0 || grade !== null} onClick={checkAnswers} type="button"><Check size={16} />立即批改</button>
          <button className="toolbar-button" disabled={loading || verses.length === 0} onClick={resetExercise} type="button"><RotateCcw size={16} />清空重做</button>
        </div>
      </div>

      {grade && gradePercent ? <div className="revelation-memorization-score" role="status">本次正确 {grade.correct} / {grade.total}，正确率 {gradePercent}%</div> : null}

      {loading ? (
        <div className="revelation-memorization-empty">正在加载默写题目…</div>
      ) : exercise.length === 0 ? (
        <div className="revelation-memorization-empty">暂时没有可用于默写的经文。</div>
      ) : (
        <div className="revelation-memorization-verses">
          {exercise.map(({ chunks, verse }) => (
            <article className="revelation-memorization-verse" key={verse.id}>
              <span className="revelation-memorization-reference">{verse.chapterNumber}:{verse.verseNumber}</span>
              <p>{chunks.map((chunk, index) => {
                if (chunk.kind === "text") return <span key={`${verse.id}-text-${index}`}>{chunk.value}</span>;
                const isCorrect = grade !== null && normalizeAnswer(answers[chunk.id] ?? "") === normalizeAnswer(chunk.answer);
                const hasAnswer = Boolean((answers[chunk.id] ?? "").trim());
                return (
                  <span className="revelation-memorization-blank-wrap" key={chunk.id}>
                    <input aria-label={`${verse.chapterNumber}:${verse.verseNumber} 填空`} className={grade === null ? "" : isCorrect ? "is-correct" : "is-wrong"} disabled={grade !== null} onChange={(event) => setAnswers((current) => ({ ...current, [chunk.id]: event.target.value }))} size={Math.max(3, Math.min(10, chunk.answer.length))} type="text" value={answers[chunk.id] ?? ""} />
                    {grade !== null ? <small className={isCorrect ? "is-correct" : "is-wrong"}>{isCorrect ? "正确" : hasAnswer ? `答案：${chunk.answer}` : `未填写：${chunk.answer}`}</small> : null}
                  </span>
                );
              })}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function createExerciseVerse(verse: BibleVerse): ExerciseVerse {
  const ranges = pickBlankRanges(verse.content);
  const chunks: BlankChunk[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) chunks.push({ kind: "text", value: verse.content.slice(cursor, range.start) });
    chunks.push({ answer: verse.content.slice(range.start, range.end), id: `${verse.id}-blank-${index}`, kind: "blank" });
    cursor = range.end;
  });
  if (cursor < verse.content.length) chunks.push({ kind: "text", value: verse.content.slice(cursor) });
  return { chunks, verse };
}

function pickBlankRanges(text: string): Array<{ end: number; start: number }> {
  const candidates = Array.from(text.matchAll(/[\u3400-\u9fff]{2,}/g)).map((match) => ({ start: match.index ?? 0, value: match[0] })).filter((candidate) => candidate.value.length >= 2);
  if (candidates.length === 0) return [];
  const targetCount = text.length >= 34 && candidates.length > 1 ? 2 : 1;
  const ranges: Array<{ end: number; start: number }> = [];
  for (const candidate of [...candidates].sort(() => Math.random() - 0.5)) {
    if (ranges.length >= targetCount) break;
    const length = Math.max(2, Math.min(Math.min(6, candidate.value.length), 2 + Math.floor(Math.random() * 4)));
    const offsetLimit = Math.max(0, candidate.value.length - length);
    const start = candidate.start + (offsetLimit === 0 ? 0 : Math.floor(Math.random() * (offsetLimit + 1)));
    const end = start + length;
    if (!ranges.some((range) => start < range.end && end > range.start)) ranges.push({ end, start });
  }
  return ranges.sort((left, right) => left.start - right.start);
}

function normalizeAnswer(value: string): string {
  return value.replace(/\s+/g, "").trim();
}
