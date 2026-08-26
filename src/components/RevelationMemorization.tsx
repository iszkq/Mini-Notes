import { BookOpen, Check, Puzzle, RefreshCw, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BibleData, type BibleVerse, loadBibleChapter, loadBibleData, sortBibleVerses } from "../bible";
import { createQslPuzzleRoom, getQslPuzzleLeaderboard, getQslPuzzleRoom, joinQslPuzzleRoom, startQslPuzzleRoom, updateQslPuzzleProgress } from "../api";
import type { QslPuzzlePlayer } from "../shared";

type RevelationMemorizationProps = { onError?: (message: string) => void; standaloneRoomId?: string; standalonePlayerToken?: string; standaloneNickname?: string; standaloneRoomSeed?: number; standaloneRoomStatus?: "waiting" | "started" | "finished"; standaloneRoundCount?: number; standaloneDifficulty?: number };
type ExerciseMode = "fill-in-blank" | "recite";
type PuzzleDifficulty = 25 | 17 | 10;
type PuzzlePhase = "difficulty" | "playing" | "result" | "complete";
type BlankChunk = { kind: "text"; value: string } | { answer: string; id: string; kind: "blank" };
type ExerciseVerse = { chunks: BlankChunk[]; verse: BibleVerse };
type Grade = { correct: number; total: number };
type PuzzleToken = { id: string; value: string };
type PuzzleRound = { id: string; segments: string[]; tokens: PuzzleToken[]; verse: BibleVerse };

const REVELATION_BOOK_NAME = "启示录";
const DEFAULT_PUZZLE_ROUNDS = 100;
const ENCOURAGEMENTS = [
  "继续加油，每一次练习都更接近熟练。",
  "不错，稳稳地再往前一步！",
  "反复练习，把经文记在心里。",
  "很有进步，继续完成这一章吧！"
];

export function RevelationMemorization({ onError, standaloneRoomId, standalonePlayerToken, standaloneNickname, standaloneRoomSeed, standaloneRoomStatus, standaloneRoundCount, standaloneDifficulty }: RevelationMemorizationProps) {
  const [data, setData] = useState<BibleData | null>(null);
  const [bookName, setBookName] = useState("");
  const [chapter, setChapter] = useState(1);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<ExerciseMode>("fill-in-blank");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [exercise, setExercise] = useState<ExerciseVerse[]>([]);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [puzzleOpen, setPuzzleOpen] = useState(false);
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [puzzleVerses, setPuzzleVerses] = useState<BibleVerse[]>([]);
  const [puzzlePhase, setPuzzlePhase] = useState<PuzzlePhase>("difficulty");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>((standaloneDifficulty as PuzzleDifficulty) ?? 25);
  const [puzzleRoundTarget, setPuzzleRoundTarget] = useState(standaloneRoundCount ?? DEFAULT_PUZZLE_ROUNDS);
  const [round, setRound] = useState<PuzzleRound | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [selectedTokens, setSelectedTokens] = useState<PuzzleToken[]>([]);
  const [remainingTime, setRemainingTime] = useState(25);
  const [puzzleScore, setPuzzleScore] = useState(0);
  const [roundCorrect, setRoundCorrect] = useState(false);
  const [qslRoomId, setQslRoomId] = useState<string | null>(standaloneRoomId ?? null);
  const [qslSeed, setQslSeed] = useState<number | null>(standaloneRoomSeed ?? null);
  const [qslStatus, setQslStatus] = useState<"waiting" | "started" | "finished">(standaloneRoomStatus ?? "waiting");
  const [leaderboard, setLeaderboard] = useState<QslPuzzlePlayer[]>([]);
  const requestIdRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const selectedTokensRef = useRef<PuzzleToken[]>([]);
  const roundRef = useRef<PuzzleRound | null>(null);
  const remainingTimeRef = useRef(25);

  const chapters = useMemo(() => (bookName ? data?.chaptersByBook[bookName] ?? [] : []), [bookName, data]);
  const blankCount = useMemo(() => exercise.reduce((count, item) => count + item.chunks.filter((chunk) => chunk.kind === "blank").length, 0), [exercise]);
  const gradePercent = grade && grade.total > 0 ? ((grade.correct / grade.total) * 100).toFixed(2) : null;

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const generateExercise = useCallback((nextVerses: BibleVerse[], nextMode: ExerciseMode) => {
    setExercise(nextVerses.map((verse) => createExerciseVerse(verse, nextMode)));
    setAnswers({});
    setGrade(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadBibleData()
      .then((nextData) => {
        if (cancelled) return;
        const nextBook = nextData.booksByCovenant.new.find((book) => book === REVELATION_BOOK_NAME) ?? "";
        if (!nextBook) throw new Error("未在读经数据中找到启示录。");
        setData(nextData);
        setBookName(nextBook);
      })
      .catch((error) => {
        if (!cancelled) onError?.(error instanceof Error ? error.message : "默写题库加载失败。");
      });
    return () => { cancelled = true; };
  }, [onError]);

  useEffect(() => {
    if (!bookName || !chapters.includes(chapter)) return;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    void loadBibleChapter(bookName, chapter)
      .then((nextVerses) => {
        if (requestId !== requestIdRef.current) return;
        const sorted = sortBibleVerses(nextVerses);
        setVerses(sorted);
        generateExercise(sorted, mode);
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) onError?.(error instanceof Error ? error.message : "默写题目加载失败。");
      })
      .finally(() => { if (requestId === requestIdRef.current) setLoading(false); });
  }, [bookName, chapter, chapters, generateExercise, mode, onError]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => { selectedTokensRef.current = selectedTokens; }, [selectedTokens]);
  useEffect(() => { roundRef.current = round; }, [round]);
  useEffect(() => { remainingTimeRef.current = remainingTime; }, [remainingTime]);

  const checkAnswers = useCallback(() => {
    if (blankCount === 0) return;
    const correct = exercise.reduce((count, item) => count + item.chunks.filter((chunk) => chunk.kind === "blank" && normalizeAnswer(answers[chunk.id] ?? "") === normalizeAnswer(chunk.answer)).length, 0);
    const nextGrade = { correct, total: blankCount };
    setGrade(nextGrade);
    showToast(nextGrade.correct === nextGrade.total ? "全部答对，太棒了！" : ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
  }, [answers, blankCount, exercise, showToast]);

  const setExerciseMode = useCallback((nextMode: ExerciseMode) => {
    setMode(nextMode);
    generateExercise(verses, nextMode);
  }, [generateExercise, verses]);

  const resetExercise = useCallback(() => generateExercise(verses, mode), [generateExercise, mode, verses]);

  const createPuzzleRound = useCallback((nextRoundNumber: number, sourceVerses = puzzleVerses) => {
    const random = seededRandom((qslSeed ?? Date.now()) + nextRoundNumber * 7919);
    const verse = sourceVerses[Math.floor(random() * sourceVerses.length)];
    if (!verse) return;
    const segments = splitVerseIntoSegments(verse.content);
    const tokens = seededShuffle(segments.map((value, index) => ({ id: `${nextRoundNumber}-${index}`, value })), random);
    const nextRound = { id: `${nextRoundNumber}-${Date.now()}`, segments, tokens, verse };
    setRound(nextRound);
    setRoundNumber(nextRoundNumber);
    setSelectedTokens([]);
    setRoundCorrect(false);
    setRemainingTime(difficulty);
    setPuzzlePhase("playing");
  }, [difficulty, puzzleVerses, qslSeed]);

  const finishPuzzleRound = useCallback(() => {
    const activeRound = roundRef.current;
    if (!activeRound || puzzlePhase !== "playing") return;
    const chosen = selectedTokensRef.current;
    const correct = chosen.length === activeRound.segments.length && activeRound.segments.every((segment, index) => chosen[index]?.value === segment);
    setRoundCorrect(correct);
    if (correct) {
      const points = activeRound.segments.length * 10 + Math.round(2 * remainingTimeRef.current);
      setPuzzleScore((score) => {
        const nextScore = score + points;
        if (qslRoomId) void updateQslPuzzleProgress(qslRoomId, { score: nextScore, completedRounds: roundNumber, playerToken: standalonePlayerToken }).catch(() => undefined);
        return nextScore;
      });
      showToast(`本轮正确，获得 ${points} 分！`);
    } else {
      showToast("再来一次，你可以做到！");
    }
    setPuzzlePhase("result");
  }, [puzzlePhase, qslRoomId, roundNumber, showToast]);

  useEffect(() => {
    if (puzzlePhase !== "playing" || !round) return;
    const endAt = Date.now() + difficulty * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, (endAt - Date.now()) / 1000);
      setRemainingTime(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        finishPuzzleRound();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [difficulty, finishPuzzleRound, puzzlePhase, round]);

  const openPuzzle = useCallback(async () => {
    if (!bookName) return;
    setPuzzleOpen(true);
    setPuzzlePhase("difficulty");
    setPuzzleScore(0);
    setRoundNumber(0);
    if (puzzleVerses.length > 0) return;
    setPuzzleLoading(true);
    try {
      const loaded = await Promise.all(chapters.map((chapterNumber) => loadBibleChapter(bookName, chapterNumber)));
      setPuzzleVerses(sortBibleVerses(loaded.flat()));
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "QSL 拼拼乐题库加载失败。");
      setPuzzleOpen(false);
    } finally {
      setPuzzleLoading(false);
    }
  }, [bookName, chapters, onError, puzzleVerses.length]);

  const startPuzzle = useCallback(() => {
    setPuzzleScore(0);
    createPuzzleRound(1);
  }, [createPuzzleRound]);

  const selectPuzzleToken = useCallback((token: PuzzleToken) => {
    if (puzzlePhase !== "playing" || !round || selectedTokensRef.current.length >= round.segments.length) return;
    setSelectedTokens((current) => [...current, token]);
  }, [puzzlePhase, round]);

  const removePuzzleToken = useCallback((index: number) => {
    if (puzzlePhase !== "playing") return;
    setSelectedTokens((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }, [puzzlePhase]);

  const continuePuzzle = useCallback(() => {
    if (!roundCorrect) { setPuzzlePhase("difficulty"); return; }
    if (roundNumber >= puzzleRoundTarget) {
      setPuzzlePhase("complete");
      return;
    }
    createPuzzleRound(roundNumber + 1);
  }, [createPuzzleRound, puzzleRoundTarget, roundCorrect, roundNumber]);

  const sharePuzzleChallenge = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    try {
      const room = await createQslPuzzleRoom({ roundCount: puzzleRoundTarget, difficulty });
      setQslRoomId(room.roomId);
      setQslSeed(room.seed);
      setQslStatus(room.status ?? "waiting");
      url.pathname = `/qsl/${room.roomId}`;
      url.hash = "";
    } catch {
      url.hash = `qsl=${puzzleRoundTarget}&difficulty=${difficulty}`;
    }
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast("挑战链接已复制，可发给朋友一起比拼！");
    } catch {
      showToast(url.toString());
    }
  }, [difficulty, puzzleRoundTarget, showToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const roomMatch = /^#qslroom=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
    if (roomMatch) {
      void joinQslPuzzleRoom(roomMatch[1]).then((room) => {
        setQslRoomId(room.roomId);
        setPuzzleRoundTarget(room.roundCount);
        setDifficulty(room.difficulty as PuzzleDifficulty);
      }).catch(() => undefined);
      return;
    }
    const match = /^#qsl=(\d+)(?:&difficulty=(10|17|25))?$/.exec(window.location.hash);
    if (!match) return;
    const count = Math.min(500, Math.max(1, Number(match[1])));
    setPuzzleRoundTarget(count);
    if (match[2]) setDifficulty(Number(match[2]) as PuzzleDifficulty);
  }, []);

  useEffect(() => {
    if (!qslRoomId) return;
    const refresh = () => void getQslPuzzleLeaderboard(qslRoomId).then(setLeaderboard).catch(() => undefined);
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [qslRoomId]);

  useEffect(() => {
    if (!qslRoomId) return;
    const refreshRoom = () => void getQslPuzzleRoom(qslRoomId).then((room) => { setQslSeed(room.seed); setQslStatus(room.status ?? "waiting"); setPuzzleRoundTarget(room.roundCount); setDifficulty(room.difficulty as PuzzleDifficulty); if (room.status === "started" && puzzlePhase === "difficulty" && standaloneRoomId) setPuzzlePhase("difficulty"); }).catch(() => undefined);
    refreshRoom();
    const timer = window.setInterval(refreshRoom, 1800);
    return () => window.clearInterval(timer);
  }, [qslRoomId, puzzlePhase, standaloneRoomId]);

  const startRoom = useCallback(async () => {
    if (!qslRoomId) return;
    try { await startQslPuzzleRoom(qslRoomId); setQslStatus("started"); showToast("房主已开始比赛，所有玩家使用同一套题目"); if (puzzleVerses.length > 0) createPuzzleRound(1); }
    catch (error) { onError?.(error instanceof Error ? error.message : "开始比赛失败"); }
  }, [createPuzzleRound, onError, puzzleVerses.length, qslRoomId, showToast]);

  useEffect(() => {
    if (!standaloneRoomId || qslStatus !== "started" || puzzlePhase !== "difficulty" || roundNumber > 0 || puzzleVerses.length === 0) return;
    createPuzzleRound(1);
  }, [createPuzzleRound, puzzlePhase, puzzleVerses.length, qslStatus, roundNumber, standaloneRoomId]);

  useEffect(() => {
    if (!standaloneRoomId || !bookName || puzzleLoading || puzzleVerses.length > 0) return;
    void openPuzzle();
  }, [bookName, openPuzzle, puzzleLoading, puzzleVerses.length, standaloneRoomId]);

  return (
    <section className={`revelation-memorization-page${standaloneRoomId ? " qsl-standalone" : ""}`} aria-busy={loading}>
      <header className="revelation-memorization-hero">
        <div>
          <span className="revelation-memorization-eyebrow"><BookOpen size={15} />启示录练习</span>
          <h1>启示录背诵默写</h1>
          <p>随机练习、全章默写与 QSL 拼拼乐。</p>
        </div>
        <div className="revelation-memorization-stat"><strong>{loading ? "…" : blankCount}</strong><span>本章填空</span></div>
      </header>

      <div className="revelation-memorization-controls">
        <label><span>选择章数</span><select disabled={loading || chapters.length === 0} onChange={(event) => setChapter(Number(event.target.value))} value={chapter}>{chapters.map((item) => <option key={item} value={item}>第 {item} 章</option>)}</select></label>
        <div className="revelation-memorization-actions">
          <button className={mode === "fill-in-blank" ? "primary-button" : "toolbar-button"} disabled={loading} onClick={() => setExerciseMode("fill-in-blank")} type="button"><RefreshCw size={16} />随机练习</button>
          <button className={mode === "recite" ? "primary-button" : "toolbar-button"} disabled={loading} onClick={() => setExerciseMode("recite")} type="button"><BookOpen size={16} />全章默写</button>
          <button className="toolbar-button" disabled={loading || blankCount === 0} onClick={checkAnswers} type="button"><Check size={16} />检查答案</button>
          <button className="toolbar-button" disabled={loading} onClick={() => void openPuzzle()} type="button"><Puzzle size={16} />QSL 拼拼乐</button>
          <button className="toolbar-button" disabled={loading || verses.length === 0} onClick={resetExercise} title="重新生成本章题目" type="button"><RotateCcw size={16} />重做</button>
        </div>
      </div>

      {grade && gradePercent ? <div className="revelation-memorization-score" role="status">本章共 {grade.total} 个空，答对 {grade.correct} 个，正确率：{gradePercent}%</div> : null}
      {loading ? <div className="revelation-memorization-empty">正在加载默写题目…</div> : exercise.length === 0 ? <div className="revelation-memorization-empty">暂时没有可用于默写的经文。</div> : <div className="revelation-memorization-verses">
        {exercise.map(({ chunks, verse }) => {
          const wrongAnswers = grade
            ? chunks.flatMap((chunk) =>
                chunk.kind === "blank" && normalizeAnswer(answers[chunk.id] ?? "") !== normalizeAnswer(chunk.answer)
                  ? [chunk.answer]
                  : []
              )
            : [];

          return (
            <article className="revelation-memorization-verse" key={verse.id}>
              <span className="revelation-memorization-reference">{verse.chapterNumber}:{verse.verseNumber}</span>
              <div>
                <p>{chunks.map((chunk, index) => {
                  if (chunk.kind === "text") return <span key={`${verse.id}-text-${index}`}>{chunk.value}</span>;
                  const isCorrect = normalizeAnswer(answers[chunk.id] ?? "") === normalizeAnswer(chunk.answer);
                  const hasAnswer = Boolean((answers[chunk.id] ?? "").trim());
                  return <span className="revelation-memorization-blank-wrap" key={chunk.id}><MemorizationBlank answer={chunk.answer} className={hasAnswer && isCorrect ? "is-correct" : grade ? "is-wrong" : ""} label={`${verse.chapterNumber}:${verse.verseNumber} 填空`} onChange={(value) => { setAnswers((current) => ({ ...current, [chunk.id]: value })); setGrade(null); }} value={answers[chunk.id] ?? ""} /></span>;
                })}</p>
                {wrongAnswers.length > 0 ? <div className="revelation-memorization-answers"><strong>参考答案</strong><div>{wrongAnswers.map((answer, index) => <span key={`${answer}-${index}`}>{answer}</span>)}</div></div> : null}
              </div>
            </article>
          );
        })}
      </div>}

      {toast ? <div className="revelation-memorization-toast" role="status">{toast}</div> : null}
      {puzzleOpen ? <div className="revelation-puzzle-backdrop" role="dialog" aria-modal="true" aria-label="QSL 拼拼乐"><section className={`revelation-puzzle-modal${standaloneRoomId && qslStatus !== "started" ? " qsl-room-waiting" : ""}`}>
        <button aria-label="退出 QSL 拼拼乐" className="revelation-puzzle-close" onClick={() => setPuzzleOpen(false)} type="button"><X size={20} /></button>
        {qslRoomId ? <aside className="revelation-puzzle-room"><strong>在线 PK 房间 {qslRoomId}</strong><span>{leaderboard.length} 人参赛</span>{leaderboard.slice(0, 5).map((player, index) => <span key={player.userId}>#{index + 1} {player.username} · {player.score} 分 · {player.completedRounds} 节</span>)}</aside> : null}
        {puzzleLoading ? <div className="revelation-puzzle-loading">正在准备 QSL 拼拼乐题库…</div> : puzzlePhase === "difficulty" ? (standaloneRoomId && qslStatus !== "started" ? <div className="revelation-puzzle-difficulty qsl-guest-waiting"><h2>已加入对决</h2><p>你好，{standaloneNickname || "参赛者"}！</p><strong>等待房主开始比赛…</strong><span>房主设置的节数和难度将在比赛开始时同步。</span></div> : qslRoomId && !standaloneRoomId && qslStatus !== "started" ? <div className="revelation-puzzle-difficulty qsl-host-waiting"><h2>房间已创建</h2><p>已锁定 {puzzleRoundTarget} 节 · 每题 {difficulty} 秒。把分享链接发给朋友，看到他们加入后即可统一开赛。</p><strong>当前已有 {leaderboard.length} 人加入</strong><button className="primary-button" onClick={() => void startRoom()} type="button">房主开始比赛</button></div> : <div className="revelation-puzzle-difficulty"><h2>QSL 拼拼乐</h2><p>将被打散的经文分句按正确顺序拼回。</p><label><span>本次挑战节数</span><input min={1} max={500} onChange={(event) => setPuzzleRoundTarget(Math.min(500, Math.max(1, Number(event.target.value) || 1)))} type="number" value={puzzleRoundTarget} /></label><fieldset><legend>选择挑战难度</legend>{([{ value: 25, label: "简单 · 25 秒" }, { value: 17, label: "一般 · 17 秒" }, { value: 10, label: "高手 · 10 秒" }] as Array<{ label: string; value: PuzzleDifficulty }>).map((item) => <label key={item.value}><input checked={difficulty === item.value} name="difficulty" onChange={() => setDifficulty(item.value)} type="radio" value={item.value} />{item.label}</label>)}</fieldset><div className="revelation-puzzle-actions"><button className="primary-button" onClick={startPuzzle} type="button">开始挑战</button><button className="toolbar-button" onClick={() => void sharePuzzleChallenge()} type="button">分享挑战</button></div></div>) : puzzlePhase === "complete" ? <div className="revelation-puzzle-difficulty"><h2>挑战完成！</h2><p>你已完成 {puzzleRoundTarget} 节经文拼拼乐，最终得分 {puzzleScore}。</p><button className="primary-button" onClick={() => setPuzzlePhase("difficulty")} type="button">再次挑战</button></div> : round ? <div className="revelation-puzzle-game"><header><div><span>⏱ {remainingTime.toFixed(2)}s</span><span>✓ 得分 {puzzleScore}</span></div><small>第 {roundNumber} / {puzzleRoundTarget} 节</small></header><h2>启示录 {round.verse.chapterNumber}:{round.verse.verseNumber}</h2><div className="revelation-puzzle-blanks">{round.segments.map((segment, index) => <button className={puzzlePhase === "result" ? selectedTokens[index]?.value === segment ? "is-correct" : "is-wrong" : selectedTokens[index] ? "is-filled" : ""} disabled={puzzlePhase !== "playing" || !selectedTokens[index]} key={`${round.id}-blank-${index}`} onClick={() => removePuzzleToken(index)} style={{ minWidth: `${Math.min(250, Math.max(48, segment.length * 18 + 20))}px` }} type="button">{selectedTokens[index]?.value}</button>)}</div><div className="revelation-puzzle-tokens">{round.tokens.map((token) => <button className={selectedTokens.some((selected) => selected.id === token.id) ? "is-used" : ""} disabled={puzzlePhase !== "playing" || selectedTokens.some((selected) => selected.id === token.id)} key={token.id} onClick={() => selectPuzzleToken(token)} type="button">{token.value}</button>)}</div><footer><button className="primary-button" onClick={puzzlePhase === "playing" ? finishPuzzleRound : continuePuzzle} type="button">{puzzlePhase === "playing" ? "完成" : roundCorrect ? roundNumber >= puzzleRoundTarget ? "查看结果" : "继续" : "重新挑战"}</button></footer></div> : null}
      </section></div> : null}
      {standaloneRoomId && qslStatus !== "started" && puzzleOpen ? <div className="qsl-waiting-overlay"><h2>等待房主开始比赛</h2><p>所有参赛者将使用同一套题目、同一顺序。</p><span>房主开始后会自动进入对决…</span></div> : null}
    </section>
  );
}

function createExerciseVerse(verse: BibleVerse, mode: ExerciseMode): ExerciseVerse {
  const protectedRanges = Array.from(verse.content.matchAll(/[（(][^（）()]*[）)]/g)).map((match) => ({
    end: (match.index ?? 0) + match[0].length,
    start: match.index ?? 0
  }));
  const clauseRanges = splitVerseIntoClauseRanges(verse.content);
  const candidates = clauseRanges.filter(({ start, end }) => {
    const isInParentheses = protectedRanges.some((range) => start >= range.start && end <= range.end);
    return !isInParentheses && /[\u4e00-\u9fa5A-Za-z0-9]/.test(verse.content.slice(start, end));
  });
  if (candidates.length === 0) return { chunks: [{ kind: "text", value: verse.content }], verse };
  const selected = mode === "recite"
    ? candidates
    : candidates.filter(() => Math.random() > 0.5);
  // Ensure random practice always has at least one blank.
  const ranges = (selected.length > 0 ? selected : [candidates[Math.floor(Math.random() * candidates.length)]])
    .map((range, index) => ({ ...range, id: `${verse.id}-blank-${index}` }));
  const chunks: BlankChunk[] = [];
  let cursor = 0;
  ranges.forEach((range) => { if (range.start > cursor) chunks.push({ kind: "text", value: verse.content.slice(cursor, range.start) }); chunks.push({ answer: verse.content.slice(range.start, range.end), id: range.id, kind: "blank" }); cursor = range.end; });
  if (cursor < verse.content.length) chunks.push({ kind: "text", value: verse.content.slice(cursor) });
  return { chunks, verse };
}

function splitVerseIntoSegments(text: string): string[] {
  const clauses = splitVerseIntoClauseRanges(text).map(({ start, end }) => {
    const punctuation = /^[，。；！？：,.;!?:]/.test(text.slice(end, end + 1)) ? 1 : 0;
    return text.slice(start, end + punctuation).trim();
  }).filter(Boolean);
  if (clauses.length >= 2) return clauses;
  const targetCount = text.length < 22 ? 4 : 6;
  const segmentSize = Math.max(1, Math.floor(text.length / targetCount));
  return Array.from({ length: targetCount }, (_, index) => index === targetCount - 1 ? text.slice(index * segmentSize) : text.slice(index * segmentSize, (index + 1) * segmentSize)).filter(Boolean);
}

/** Split a verse into natural clauses, keeping punctuation outside the blank. */
function splitVerseIntoClauseRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const punctuation = new Set(["，", "。", "；", "！", "？", "：", ",", ".", ";", "!", "?", ":"]);
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!punctuation.has(text[index])) continue;
    if (index > start) ranges.push({ start, end: index });
    start = index + 1;
  }
  if (start < text.length) ranges.push({ start, end: text.length });
  return ranges;
}

function shuffle<T>(items: T[]): T[] { return [...items].sort(() => Math.random() - 0.5); }
function normalizeAnswer(value: string): string { return value.replace(/\s+/g, "").trim(); }
function seededRandom(seed: number): () => number { let value = Math.abs(Math.floor(seed)) || 1; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; }
function seededShuffle<T>(items: T[], random: () => number): T[] { const next = [...items]; for (let index = next.length - 1; index > 0; index -= 1) { const swap = Math.floor(random() * (index + 1)); [next[index], next[swap]] = [next[swap], next[index]]; } return next; }

function MemorizationBlank({
  answer,
  className,
  label,
  onChange,
  value
}: {
  answer: string;
  className: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const isComposingRef = useRef(false);

  useEffect(() => {
    if (elementRef.current && elementRef.current.textContent !== value) {
      elementRef.current.textContent = value;
    }
  }, [value]);

  return (
    <span
      aria-label={label}
      className={`revelation-memorization-editable ${className}`}
      contentEditable
      data-answer-length={answer.length}
      onCompositionEnd={(event) => {
        isComposingRef.current = false;
        onChange(event.currentTarget.textContent ?? "");
      }}
      onCompositionStart={() => {
        isComposingRef.current = true;
      }}
      onInput={(event) => {
        if (!isComposingRef.current) {
          onChange(event.currentTarget.textContent ?? "");
        }
      }}
      ref={elementRef}
      role="textbox"
      suppressContentEditableWarning
      tabIndex={0}
    />
  );
}
