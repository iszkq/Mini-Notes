import { useState } from "react";
import { joinQslPuzzleRoom } from "../api";
import { RevelationMemorization } from "./RevelationMemorization";

export function QslBattleView({ roomId }: { roomId: string }) {
  const [nickname, setNickname] = useState("");
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [roomSeed, setRoomSeed] = useState<number | undefined>();
  const [roomRoundCount, setRoomRoundCount] = useState<number | undefined>();
  const [roomDifficulty, setRoomDifficulty] = useState<number | undefined>();
  const [roomStatus, setRoomStatus] = useState<"waiting" | "started" | "finished">("waiting");
  const [error, setError] = useState("");
  if (playerToken) return <main className="qsl-battle-shell"><RevelationMemorization standaloneRoomId={roomId} standalonePlayerToken={playerToken} standaloneNickname={nickname} standaloneRoomSeed={roomSeed} standaloneRoomStatus={roomStatus} standaloneRoundCount={roomRoundCount} standaloneDifficulty={roomDifficulty} onError={setError} /></main>;
  return <main className="qsl-battle-shell"><section className="qsl-battle-lobby"><div className="qsl-battle-brand">QSL</div><h1>拼拼乐在线对决</h1><p>输入昵称加入房间，等待房主开始后，所有人将进行同一套题目。</p><label>你的昵称<input autoFocus maxLength={20} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="例如：小明" /></label>{error ? <div className="form-error">{error}</div> : null}<button className="primary-button" disabled={!nickname.trim()} onClick={() => void joinQslPuzzleRoom(roomId, nickname.trim()).then((room) => { setRoomSeed(room.seed); setRoomStatus(room.status ?? "waiting"); setRoomRoundCount(room.roundCount); setRoomDifficulty(room.difficulty); setPlayerToken(room.playerToken ?? null); }).catch((e) => setError(e instanceof Error ? e.message : "加入房间失败"))}>加入对决</button></section></main>;
}
