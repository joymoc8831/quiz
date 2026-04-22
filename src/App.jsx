import { useState, useEffect } from 'react';
import { db } from './firebase.js';
import { doc, setDoc, updateDoc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { Plus, Trash2, Copy, Check, ArrowLeft, Users, BarChart3, Play, Send, Clock, ChevronRight, X, Trophy } from 'lucide-react';

const MARKS = ['A', 'B', 'C', 'D'];
const MARK_COLORS = ['#e85d2f', '#2f7ae8', '#2fa368', '#c44ea8'];

// ---------- Firestore helpers ----------
async function saveRoom(code, room) {
  await setDoc(doc(db, 'rooms', code), room);
}
async function updateRoom(code, updates) {
  await updateDoc(doc(db, 'rooms', code), updates);
}
async function loadRoom(code) {
  const snap = await getDoc(doc(db, 'rooms', code));
  return snap.exists() ? snap.data() : null;
}
async function saveParticipant(code, id, data) {
  await setDoc(doc(db, 'rooms', code, 'participants', id), data);
}

const genCode = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Main ----------
export default function QuizApp() {
  const [role, setRole] = useState(null);
  const [view, setView] = useState('home');
  const [code, setCode] = useState('');
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [myId, setMyId] = useState('');
  const [myName, setMyName] = useState('');
  const [myAnswers, setMyAnswers] = useState({});
  const [toast, setToast] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // Subscribe to room (real-time)
  useEffect(() => {
    if (!code) { setRoom(null); return; }
    const unsub = onSnapshot(doc(db, 'rooms', code), (snap) => {
      if (snap.exists()) setRoom(snap.data());
    });
    return () => unsub();
  }, [code]);

  // Subscribe to participants (real-time)
  useEffect(() => {
    if (!code) { setParticipants([]); return; }
    const unsub = onSnapshot(collection(db, 'rooms', code, 'participants'), (snap) => {
      setParticipants(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, [code]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };
  const exit = () => {
    setRole(null); setView('home'); setCode(''); setRoom(null);
    setMyId(''); setMyName(''); setMyAnswers({}); setParticipants([]);
  };

  const pickAnswer = async (choice) => {
    if (!room || room.status !== 'active') return;
    const qIdx = room.currentQIdx;
    if (myAnswers[qIdx] !== undefined) return;
    const elapsed = (Date.now() - (room.questionStartedAt || 0)) / 1000;
    if (elapsed > room.timeLimit) return;
    const newAns = { ...myAnswers, [qIdx]: choice };
    setMyAnswers(newAns);
    await saveParticipant(code, myId, { id: myId, name: myName, answers: newAns, joinedAt: Date.now() });
  };

  if (!code || !room) {
    return (
      <Shell toast={toast}>
        {view === 'home' && <Home onHost={() => setView('create')} onJoin={() => setView('join')} />}
        {view === 'create' && (
          <CreateRoom
            onBack={() => setView('home')}
            onCreate={async (questions, timeLimit) => {
              const c = genCode();
              const r = {
                code: c, questions, timeLimit,
                status: 'waiting', currentQIdx: -1, questionStartedAt: null,
                createdAt: Date.now()
              };
              await saveRoom(c, r);
              setRole('host');
              setCode(c);
            }}
          />
        )}
        {view === 'join' && (
          <Join
            onBack={() => setView('home')}
            onJoin={async (c, name) => {
              const r = await loadRoom(c.toUpperCase());
              if (!r) { showToast('ルームが見つかりません'); return; }
              if (r.status === 'finished') { showToast('このクイズは既に終了しています'); return; }
              const id = genId();
              await saveParticipant(r.code, id, { id, name, answers: {}, joinedAt: Date.now() });
              setRole('participant');
              setMyId(id); setMyName(name); setMyAnswers({});
              setCode(r.code);
            }}
          />
        )}
      </Shell>
    );
  }

  return (
    <Shell toast={toast}>
      {role === 'host' && room.status === 'waiting' && (
        <HostWaiting
          code={code} room={room} participants={participants}
          onStart={() => updateRoom(code, { status: 'active', currentQIdx: 0, questionStartedAt: Date.now() })}
          onExit={exit} toast={showToast}
        />
      )}
      {role === 'host' && room.status === 'active' && (
        <HostActive
          room={room} participants={participants} now={now}
          onNext={async () => {
            const next = room.currentQIdx + 1;
            if (next >= room.questions.length) {
              await updateRoom(code, { status: 'finished', currentQIdx: -1 });
            } else {
              await updateRoom(code, { currentQIdx: next, questionStartedAt: Date.now() });
            }
          }}
          onExit={exit}
        />
      )}
      {role === 'host' && room.status === 'finished' && (
        <Results room={room} participants={participants} onExit={exit} />
      )}
      {role === 'participant' && room.status === 'waiting' && (
        <ParticipantWait name={myName} room={room} count={participants.length} onExit={exit} />
      )}
      {role === 'participant' && room.status === 'active' && (
        <ParticipantAnswer room={room} myAnswers={myAnswers} now={now} onPick={pickAnswer} onExit={exit} />
      )}
      {role === 'participant' && room.status === 'finished' && (
        <ParticipantDone room={room} myAnswers={myAnswers} name={myName} onExit={exit} />
      )}
    </Shell>
  );
}

function Shell({ children, toast }) {
  return (
    <div style={styles.root}>
      <GlobalStyles />
      <div style={styles.shell}>{children}</div>
      {toast && <div style={styles.toast}>{toast}</div>}
    </div>
  );
}

function Home({ onHost, onJoin }) {
  return (
    <div style={styles.page}>
      <div style={styles.heroWrap}>
        <div style={styles.eyebrow}>QUIZ ROOM</div>
        <h1 style={styles.hero}>
          クリーンアップ・インターナショナル<br />
          <span style={styles.heroAccent}>夕会クイズ</span>
        </h1>
        <p style={styles.heroSub}>ホストが進行、全員の画面が連動</p>
      </div>
      <div style={styles.bigBtns}>
        <button style={{ ...styles.bigBtn, ...styles.bigBtnPrimary }} onClick={onHost}>
          <span style={styles.bigBtnLabel}>出題者</span>
          <span style={styles.bigBtnSub}>ホストとして作成</span>
        </button>
        <button style={{ ...styles.bigBtn, ...styles.bigBtnSecondary }} onClick={onJoin}>
          <span style={styles.bigBtnLabel}>参加者</span>
          <span style={styles.bigBtnSub}>ルームコードを入力して参加</span>
        </button>
      </div>
    </div>
  );
}

function CreateRoom({ onBack, onCreate }) {
  const [questions, setQuestions] = useState([{ text: '', options: ['', '', '', ''], correct: null }]);
  const [timeLimit, setTimeLimit] = useState(20);

  const update = (i, patch) => {
    const next = [...questions];
    next[i] = { ...next[i], ...patch };
    setQuestions(next);
  };
  const updateOpt = (qi, oi, val) => {
    const next = [...questions];
    next[qi].options[oi] = val;
    setQuestions(next);
  };
  const add = () => setQuestions([...questions, { text: '', options: ['', '', '', ''], correct: null }]);
  const remove = (i) => setQuestions(questions.filter((_, idx) => idx !== i));

  const canSubmit = questions.length > 0 && questions.every((q) =>
    q.text.trim() && q.options.every((o) => o.trim())
  );

  return (
    <div style={styles.page}>
      <TopBar onBack={onBack} title="問題を作成" />

      <div style={styles.settingCard}>
        <div style={styles.settingLabel}><Clock size={14} /> 1問あたりの制限時間</div>
        <div style={styles.timeSettings}>
          <button style={styles.timeStep} onClick={() => setTimeLimit(Math.max(5, timeLimit - 5))}>−5</button>
          <input
            type="number"
            style={styles.timeInput}
            value={timeLimit}
            onChange={(e) => setTimeLimit(Math.max(5, Math.min(300, parseInt(e.target.value) || 20)))}
          />
          <span style={styles.timeUnit}>秒</span>
          <button style={styles.timeStep} onClick={() => setTimeLimit(Math.min(300, timeLimit + 5))}>+5</button>
        </div>
      </div>

      <div style={styles.qList}>
        {questions.map((q, qi) => (
          <div key={qi} style={styles.qCard}>
            <div style={styles.qHead}>
              <span style={styles.qNum}>Q{qi + 1}</span>
              {questions.length > 1 && (
                <button style={styles.iconBtn} onClick={() => remove(qi)} aria-label="削除">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            <textarea
              style={styles.qInput}
              placeholder="問題文を入力"
              value={q.text}
              onChange={(e) => update(qi, { text: e.target.value })}
              rows={2}
            />
            <div style={styles.opts}>
              {q.options.map((opt, oi) => (
                <div key={oi} style={styles.optRow}>
                  <button
                    onClick={() => update(qi, { correct: q.correct === oi ? null : oi })}
                    style={{
                      ...styles.markBtn,
                      background: q.correct === oi ? MARK_COLORS[oi] : 'transparent',
                      color: q.correct === oi ? '#fff' : MARK_COLORS[oi],
                      borderColor: MARK_COLORS[oi]
                    }}
                  >
                    {MARKS[oi]}
                  </button>
                  <input
                    style={styles.optInput}
                    placeholder={`選択肢${oi + 1}`}
                    value={opt}
                    onChange={(e) => updateOpt(qi, oi, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div style={styles.hint}>
              {q.correct !== null ? `正解: ${MARKS[q.correct]}` : '※ 正解を設定する場合は丸数字をタップ(任意)'}
            </div>
          </div>
        ))}
      </div>
      <button style={styles.addBtn} onClick={add}>
        <Plus size={18} /> 問題を追加
      </button>
      <button
        style={{ ...styles.primaryBtn, opacity: canSubmit ? 1 : 0.4 }}
        disabled={!canSubmit}
        onClick={() => onCreate(questions, timeLimit)}
      >
        <Play size={18} /> ルームを作成
      </button>
    </div>
  );
}

function Join({ onBack, onJoin }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const can = code.trim().length === 4 && name.trim();
  return (
    <div style={styles.page}>
      <TopBar onBack={onBack} title="ルームに参加" />
      <div style={styles.formBlock}>
        <label style={styles.label}>ルームコード</label>
        <input
          style={styles.codeInput}
          placeholder="XXXX" maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>
      <div style={styles.formBlock}>
        <label style={styles.label}>チーム名</label>
        <input
          style={styles.textInput} placeholder="表示名" maxLength={20}
          value={name} onChange={(e) => setName(e.target.value)}
        />
      </div>
      <button
        style={{ ...styles.primaryBtn, opacity: can ? 1 : 0.4 }}
        disabled={!can}
        onClick={() => onJoin(code.trim(), name.trim())}
      >
        <Send size={18} /> 参加する
      </button>
    </div>
  );
}

function HostWaiting({ code, room, participants, onStart, onExit, toast }) {
  const total = room.questions.length;
  const canStart = participants.length > 0;
  const copy = () => {
    try { navigator.clipboard.writeText(code); toast('コードをコピーしました'); }
    catch { toast(code); }
  };
  return (
    <div style={styles.page}>
      <TopBar onBack={onExit} title="ルーム待機中" />
      <div style={styles.codeCard}>
        <div style={styles.codeLabel}>ルームコード</div>
        <div style={styles.codeBig}>{code}</div>
        <button style={styles.copyBtn} onClick={copy}>
          <Copy size={14} /> コピーして共有
        </button>
      </div>
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <Users size={16} style={{ color: '#e85d2f' }} />
          <div>
            <div style={styles.statNum}>{participants.length}</div>
            <div style={styles.statLabel}>参加者</div>
          </div>
        </div>
        <div style={styles.statCard}>
          <BarChart3 size={16} style={{ color: '#2f7ae8' }} />
          <div>
            <div style={styles.statNum}>{total}</div>
            <div style={styles.statLabel}>問題数</div>
          </div>
        </div>
        <div style={styles.statCard}>
          <Clock size={16} style={{ color: '#2fa368' }} />
          <div>
            <div style={styles.statNum}>{room.timeLimit}s</div>
            <div style={styles.statLabel}>1問</div>
          </div>
        </div>
      </div>

      <div style={styles.sectionTitle}>参加者一覧</div>
      {participants.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.spinnerWrap}>
            <div style={{ ...styles.spinnerDot, animationDelay: '0s' }}></div>
            <div style={{ ...styles.spinnerDot, animationDelay: '0.15s' }}></div>
            <div style={{ ...styles.spinnerDot, animationDelay: '0.3s' }}></div>
          </div>
          <div>参加者を待っています…</div>
        </div>
      ) : (
        <div style={styles.partList}>
          {participants.map((p) => (
            <div key={p.id} style={styles.partRow}>
              <div style={styles.partName}>{p.name}</div>
              <div style={{ ...styles.partBadge, background: '#eafaf0', color: '#2fa368' }}>
                <Check size={12} /> 準備完了
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        style={{ ...styles.primaryBtn, opacity: canStart ? 1 : 0.4 }}
        disabled={!canStart}
        onClick={onStart}
      >
        <Play size={18} /> クイズを開始
      </button>
      {!canStart && <div style={styles.hintCenter}>参加者が1人以上必要です</div>}
    </div>
  );
}

function HostActive({ room, participants, now, onNext, onExit }) {
  const qIdx = room.currentQIdx;
  const q = room.questions[qIdx];
  const total = room.questions.length;
  const isLast = qIdx === total - 1;

  const elapsed = (now - (room.questionStartedAt || now)) / 1000;
  const remaining = Math.max(0, room.timeLimit - elapsed);
  const timeUp = remaining <= 0;

  const counts = [0, 0, 0, 0];
  participants.forEach((p) => {
    const a = p.answers?.[qIdx];
    if (a !== undefined) counts[a]++;
  });
  const answered = counts.reduce((s, c) => s + c, 0);
  const maxCount = Math.max(...counts, 1);
  const allAnswered = answered >= participants.length && participants.length > 0;
  const canAdvance = timeUp || allAnswered;

  return (
    <div style={styles.page}>
      <div style={styles.activeMeta}>
        <span style={styles.activeNum}>問題 {qIdx + 1} / {total}</span>
        <span style={styles.roleBadge}>HOST</span>
      </div>

      <div style={styles.timerCard}>
        <div style={styles.timerTop}>
          <Clock size={16} />
          <span style={{ ...styles.timerText, color: timeUp ? '#9a9385' : '#1a2332' }}>
            {timeUp ? '時間終了' : `残り ${Math.ceil(remaining)} 秒`}
          </span>
          <span style={styles.answeredCount}>{answered} / {participants.length} 回答</span>
        </div>
        <div style={styles.timerBar}>
          <div style={{
            ...styles.timerFill,
            width: `${(remaining / room.timeLimit) * 100}%`,
            background: timeUp ? '#c0b9a8' : '#e85d2f'
          }} />
        </div>
      </div>

      <div style={styles.qBig}>{q.text}</div>

      <div style={styles.liveOpts}>
        {q.options.map((opt, oi) => {
          const c = counts[oi];
          const isCorrect = timeUp && q.correct === oi;
          return (
            <div key={oi} style={{
              ...styles.liveOpt,
              borderColor: isCorrect ? '#2fa368' : '#e8e2d4',
              background: isCorrect ? '#eafaf0' : '#fff'
            }}>
              <div style={styles.liveOptTop}>
                <span style={{ ...styles.liveMark, color: MARK_COLORS[oi] }}>{MARKS[oi]}</span>
                <span style={styles.liveText}>{opt}</span>
                <span style={styles.liveCount}>
                  {c}
                  {isCorrect && <span style={styles.correctTag}>正解</span>}
                </span>
              </div>
              <div style={styles.barTrack}>
                <div style={{
                  ...styles.barFill,
                  width: `${(c / maxCount) * 100}%`,
                  background: MARK_COLORS[oi]
                }} />
              </div>
            </div>
          );
        })}
      </div>

      <button
        style={{ ...styles.primaryBtn, opacity: canAdvance ? 1 : 0.4 }}
        disabled={!canAdvance}
        onClick={onNext}
      >
        {isLast ? <><Trophy size={18} /> 結果発表</> : <><ChevronRight size={18} /> 次の問題へ</>}
      </button>
      {!canAdvance && <div style={styles.hintCenter}>時間終了または全員回答で進めます</div>}

      <button style={styles.exitBtn} onClick={onExit}>
        <X size={14} /> 終了
      </button>
    </div>
  );
}

function ParticipantWait({ name, room, count, onExit }) {
  return (
    <div style={styles.page}>
      <TopBar onBack={onExit} title="待機中" />
      <div style={styles.waitCard}>
        <div style={styles.spinnerWrap}>
          <div style={{ ...styles.spinnerDot, animationDelay: '0s' }}></div>
          <div style={{ ...styles.spinnerDot, animationDelay: '0.15s' }}></div>
          <div style={{ ...styles.spinnerDot, animationDelay: '0.3s' }}></div>
        </div>
        <div style={styles.waitTitle}>ホストの開始を待っています…</div>
        <div style={styles.waitSub}><strong>{name}</strong> として参加中</div>
        <div style={styles.waitMetaRow}>
          <span>{room.questions.length} 問</span>
          <span>·</span>
          <span>1問 {room.timeLimit} 秒</span>
          <span>·</span>
          <span>{count} 人</span>
        </div>
      </div>
    </div>
  );
}

function ParticipantAnswer({ room, myAnswers, now, onPick, onExit }) {
  const qIdx = room.currentQIdx;
  const q = room.questions[qIdx];
  const total = room.questions.length;

  const elapsed = (now - (room.questionStartedAt || now)) / 1000;
  const remaining = Math.max(0, room.timeLimit - elapsed);
  const timeUp = remaining <= 0;

  const myChoice = myAnswers[qIdx];
  const hasAnswered = myChoice !== undefined;
  const locked = hasAnswered || timeUp;

  return (
    <div style={styles.page}>
      <div style={styles.qMeta}>
        <span>問題 {qIdx + 1} / {total}</span>
        <span style={{ color: timeUp ? '#9a9385' : '#e85d2f', fontWeight: 700 }}>
          {timeUp ? '時間終了' : `${Math.ceil(remaining)} 秒`}
        </span>
      </div>
      <div style={styles.timerBar}>
        <div style={{
          ...styles.timerFill,
          width: `${(remaining / room.timeLimit) * 100}%`,
          background: timeUp ? '#c0b9a8' : '#e85d2f'
        }} />
      </div>

      <div style={styles.questionText}>{q.text}</div>

      <div style={styles.answerOpts}>
        {q.options.map((opt, oi) => {
          const isSelected = myChoice === oi;
          const isCorrect = timeUp && q.correct === oi;
          const isWrong = timeUp && isSelected && q.correct !== null && q.correct !== oi;

          let border = '#e8e2d4', bg = '#fff', color = '#1a2332';
          if (isCorrect) { border = '#2fa368'; bg = '#eafaf0'; }
          else if (isWrong) { border = '#e85d2f'; bg = '#ffe9df'; }
          else if (isSelected) { border = MARK_COLORS[oi]; bg = MARK_COLORS[oi]; color = '#fff'; }

          return (
            <button
              key={oi}
              disabled={locked}
              style={{
                ...styles.answerBtn,
                borderColor: border, background: bg, color,
                opacity: locked && !isSelected && !isCorrect ? 0.5 : 1,
                cursor: locked ? 'default' : 'pointer'
              }}
              onClick={() => !locked && onPick(oi)}
            >
              <span style={{ ...styles.answerMark, color: isSelected ? '#fff' : MARK_COLORS[oi] }}>
                {MARKS[oi]}
              </span>
              <span style={styles.answerText}>{opt}</span>
              {isCorrect && <Check size={18} color="#2fa368" />}
            </button>
          );
        })}
      </div>

      {hasAnswered && !timeUp && (
        <div style={{ ...styles.statusBanner, background: '#eafaf0', color: '#2fa368' }}>
          <Check size={16} /> 回答を送信しました
        </div>
      )}
      {timeUp && !hasAnswered && (
        <div style={{ ...styles.statusBanner, background: '#ffe9df', color: '#e85d2f' }}>
          時間切れでした
        </div>
      )}
      {timeUp && q.correct !== null && (
        <div style={{ ...styles.statusBanner, background: '#fffbe8', color: '#a88500' }}>
          正解は <strong style={{ fontSize: 18 }}>{MARKS[q.correct]}</strong>
        </div>
      )}
      {timeUp && (
        <div style={styles.hintCenter}>ホストが次へ進めるのを待っています…</div>
      )}
    </div>
  );
}

function ParticipantDone({ room, myAnswers, name, onExit }) {
  const total = room.questions.length;
  const scored = room.questions.some((q) => q.correct !== null);
  const score = scored ? room.questions.reduce((s, q, qi) =>
    q.correct !== null && myAnswers[qi] === q.correct ? s + 1 : s, 0) : null;

  return (
    <div style={styles.page}>
      <div style={styles.doneWrap}>
        <div style={styles.doneIcon}>
          <Trophy size={32} strokeWidth={2.5} />
        </div>
        <h2 style={styles.doneTitle}>クイズ終了!</h2>
        <p style={styles.doneSub}>{name} さん、お疲れさまでした</p>
        {scored && (
          <div style={styles.scoreCard}>
            <div style={styles.scoreLabel}>あなたのスコア</div>
            <div style={styles.scoreBig}>{score}<span style={styles.scoreTotal}> / {total}</span></div>
          </div>
        )}
      </div>

      <div style={styles.sectionTitle}>あなたの回答</div>
      <div style={styles.myAnsList}>
        {room.questions.map((q, qi) => {
          const a = myAnswers[qi];
          const correct = q.correct !== null && a === q.correct;
          const wrong = q.correct !== null && a !== undefined && a !== q.correct;
          return (
            <div key={qi} style={styles.myAnsRow}>
              <div style={styles.myAnsHead}>
                <span style={styles.myAnsNum}>Q{qi + 1}</span>
                <div style={{
                  ...styles.myAnsChip,
                  color: a !== undefined ? MARK_COLORS[a] : '#c0b9a8',
                  borderColor: correct ? '#2fa368' : wrong ? '#e85d2f' : '#e8e2d4',
                  background: correct ? '#eafaf0' : wrong ? '#ffe9df' : '#fff'
                }}>
                  {a !== undefined ? MARKS[a] : '—'}
                </div>
              </div>
              <div style={styles.myAnsText}>{q.text}</div>
              {q.correct !== null && !correct && (
                <div style={styles.myAnsCorrect}>正解: {MARKS[q.correct]}</div>
              )}
            </div>
          );
        })}
      </div>

      <button style={styles.ghostBtn} onClick={onExit}>トップへ戻る</button>
    </div>
  );
}

function Results({ room, participants, onExit }) {
  const [tab, setTab] = useState('summary');
  const total = room.questions.length;

  const scored = room.questions.some((q) => q.correct !== null);
  const totals = room.questions.map((q, qi) => {
    const counts = [0, 0, 0, 0];
    participants.forEach((p) => {
      const a = p.answers?.[qi];
      if (a !== undefined) counts[a]++;
    });
    return counts;
  });

  const scores = scored ? participants.map((p) => {
    let s = 0;
    room.questions.forEach((q, qi) => {
      if (q.correct !== null && p.answers?.[qi] === q.correct) s++;
    });
    return { ...p, score: s };
  }).sort((a, b) => b.score - a.score) : [];

  return (
    <div style={styles.page}>
      <TopBar onBack={onExit} title="集計結果" />
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'summary' ? styles.tabActive : {}) }} onClick={() => setTab('summary')}>問題ごと</button>
        <button style={{ ...styles.tab, ...(tab === 'byPerson' ? styles.tabActive : {}) }} onClick={() => setTab('byPerson')}>回答者ごと</button>
      </div>

      {tab === 'summary' && (
        <div style={styles.summaryList}>
          {room.questions.map((q, qi) => {
            const counts = totals[qi];
            const max = Math.max(...counts, 1);
            return (
              <div key={qi} style={styles.qCard}>
                <div style={styles.qNumSmall}>Q{qi + 1}</div>
                <div style={styles.qResText}>{q.text}</div>
                <div style={styles.bars}>
                  {q.options.map((opt, oi) => {
                    const isCorrect = q.correct === oi;
                    return (
                      <div key={oi} style={styles.barRow}>
                        <div style={{ ...styles.barMark, color: MARK_COLORS[oi] }}>{MARKS[oi]}</div>
                        <div style={styles.barBody}>
                          <div style={styles.barTop}>
                            <span style={styles.barOpt}>
                              {opt}
                              {isCorrect && <span style={styles.correctTag}>正解</span>}
                            </span>
                            <span style={styles.barCount}>{counts[oi]}</span>
                          </div>
                          <div style={styles.barTrack}>
                            <div style={{
                              ...styles.barFill,
                              width: `${(counts[oi] / max) * 100}%`,
                              background: MARK_COLORS[oi]
                            }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'byPerson' && (
        <div style={styles.summaryList}>
          {scored && scores.length > 0 && (
            <div style={styles.qCard}>
              <div style={styles.sectionTitleInline}>ランキング</div>
              {scores.map((p, i) => (
                <div key={p.id} style={styles.rankRow}>
                  <div style={styles.rankPos}>{i + 1}</div>
                  <div style={styles.rankName}>{p.name}</div>
                  <div style={styles.rankScore}>{p.score}<span style={styles.rankTotal}>/{total}</span></div>
                </div>
              ))}
            </div>
          )}
          {participants.map((p) => (
            <div key={p.id} style={styles.qCard}>
              <div style={styles.personHead}>
                <div style={styles.personName}>{p.name}</div>
                <div style={styles.personCount}>{Object.keys(p.answers || {}).length}/{total}</div>
              </div>
              <div style={styles.personAns}>
                {room.questions.map((q, qi) => {
                  const a = p.answers?.[qi];
                  const correct = q.correct !== null && a === q.correct;
                  const wrong = q.correct !== null && a !== undefined && a !== q.correct;
                  return (
                    <div key={qi} style={{
                      ...styles.ansChip,
                      color: a !== undefined ? MARK_COLORS[a] : '#c0b9a8',
                      borderColor: correct ? '#2fa368' : wrong ? '#e85d2f33' : '#e8e2d4',
                      background: correct ? '#eafaf0' : '#fff'
                    }} title={`Q${qi + 1}`}>
                      {a !== undefined ? MARKS[a] : '—'}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {participants.length === 0 && <div style={styles.empty}>まだ回答がありません</div>}
        </div>
      )}
    </div>
  );
}

function TopBar({ onBack, title }) {
  return (
    <div style={styles.topBar}>
      <button style={styles.backBtn} onClick={onBack}><ArrowLeft size={18} /></button>
      <div style={styles.topTitle}>{title}</div>
      <div style={{ width: 36 }} />
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=DotGothic16&display=swap');
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      @keyframes dotBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: #faf6f0; }
      input, textarea, button { font-family: inherit; }
      button:not(:disabled):active { transform: scale(0.97); }
      button { transition: transform 0.1s, background 0.2s, color 0.2s, border-color 0.2s, opacity 0.2s; }
    `}</style>
  );
}

const styles = {
  root: { minHeight: '100vh', background: '#faf6f0', fontFamily: "'Zen Kaku Gothic New', system-ui, sans-serif", color: '#1a2332', padding: '16px 12px 40px', position: 'relative' },
  shell: { maxWidth: 520, margin: '0 auto' },
  page: { display: 'flex', flexDirection: 'column', gap: 14 },
  heroWrap: { padding: '40px 4px 16px' },
  eyebrow: { fontFamily: "'DotGothic16', monospace", fontSize: 13, letterSpacing: 3, color: '#e85d2f', marginBottom: 16 },
  hero: { fontSize: 38, fontWeight: 900, lineHeight: 1.15, margin: 0, letterSpacing: '-0.02em' },
  heroAccent: { color: '#e85d2f' },
  heroSub: { fontSize: 15, color: '#6a6558', marginTop: 12, lineHeight: 1.6 },
  bigBtns: { display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 },
  bigBtn: { border: 'none', borderRadius: 18, padding: '22px 22px', textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 },
  bigBtnPrimary: { background: '#1a2332', color: '#faf6f0' },
  bigBtnSecondary: { background: '#fff', color: '#1a2332', border: '2px solid #1a2332' },
  bigBtnLabel: { fontSize: 19, fontWeight: 700 },
  bigBtnSub: { fontSize: 13, opacity: 0.7 },
  topBar: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 12, border: '1.5px solid #e8e2d4', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a2332' },
  topTitle: { flex: 1, fontSize: 16, fontWeight: 700, textAlign: 'center' },
  settingCard: { background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1.5px solid #efe9db', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingLabel: { fontSize: 13, fontWeight: 700, color: '#6a6558', display: 'flex', alignItems: 'center', gap: 6 },
  timeSettings: { display: 'flex', alignItems: 'center', gap: 6 },
  timeStep: { width: 32, height: 32, borderRadius: 8, border: '1.5px solid #e8e2d4', background: '#faf6f0', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#1a2332' },
  timeInput: { width: 56, textAlign: 'center', border: '1.5px solid #e8e2d4', borderRadius: 8, padding: '6px 4px', fontSize: 16, fontWeight: 700, outline: 'none', background: '#faf6f0' },
  timeUnit: { fontSize: 12, color: '#9a9385' },
  qList: { display: 'flex', flexDirection: 'column', gap: 12 },
  qCard: { background: '#fff', borderRadius: 16, padding: 16, border: '1.5px solid #efe9db' },
  qHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  qNum: { fontFamily: "'DotGothic16', monospace", fontSize: 14, color: '#e85d2f', letterSpacing: 1 },
  qNumSmall: { fontFamily: "'DotGothic16', monospace", fontSize: 12, color: '#e85d2f', marginBottom: 4 },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: '#9a9385', borderRadius: 8 },
  qInput: { width: '100%', border: '1.5px solid #e8e2d4', borderRadius: 10, padding: '10px 12px', fontSize: 15, resize: 'vertical', outline: 'none', background: '#faf6f0' },
  opts: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 },
  optRow: { display: 'flex', gap: 8, alignItems: 'center' },
  markBtn: { width: 38, height: 38, borderRadius: 10, border: '1.5px solid', fontSize: 16, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  optInput: { flex: 1, border: '1.5px solid #e8e2d4', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', background: '#faf6f0' },
  hint: { fontSize: 12, color: '#9a9385', marginTop: 10 },
  hintCenter: { fontSize: 12, color: '#9a9385', textAlign: 'center', marginTop: 4 },
  addBtn: { background: 'transparent', border: '1.5px dashed #c0b9a8', borderRadius: 14, padding: '14px', fontSize: 14, fontWeight: 600, color: '#6a6558', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  primaryBtn: { background: '#e85d2f', color: '#fff', border: 'none', borderRadius: 14, padding: '16px', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
  ghostBtn: { background: 'transparent', color: '#1a2332', border: '1.5px solid #1a2332', borderRadius: 14, padding: '12px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 12 },
  exitBtn: { background: 'transparent', color: '#9a9385', border: 'none', fontSize: 12, cursor: 'pointer', padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center', marginTop: 4 },
  codeCard: { background: '#1a2332', color: '#faf6f0', borderRadius: 20, padding: 24, textAlign: 'center' },
  codeLabel: { fontFamily: "'DotGothic16', monospace", fontSize: 12, letterSpacing: 3, opacity: 0.6, marginBottom: 10 },
  codeBig: { fontSize: 52, fontWeight: 900, letterSpacing: '0.15em', fontFamily: "'DotGothic16', monospace", color: '#e85d2f', marginBottom: 14 },
  copyBtn: { background: 'rgba(255,255,255,0.1)', color: '#faf6f0', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 },
  statsRow: { display: 'flex', gap: 10 },
  statCard: { flex: 1, background: '#fff', borderRadius: 14, padding: 14, border: '1.5px solid #efe9db', display: 'flex', alignItems: 'center', gap: 12 },
  statNum: { fontSize: 22, fontWeight: 800 },
  statLabel: { fontSize: 11, color: '#9a9385' },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: '#6a6558', marginTop: 8, letterSpacing: 1 },
  sectionTitleInline: { fontSize: 13, fontWeight: 700, color: '#6a6558', marginBottom: 10, letterSpacing: 1 },
  empty: { padding: 24, textAlign: 'center', color: '#9a9385', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 14, border: '1.5px dashed #e8e2d4' },
  partList: { display: 'flex', flexDirection: 'column', gap: 8 },
  partRow: { background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1.5px solid #efe9db', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  partName: { fontSize: 15, fontWeight: 600 },
  partBadge: { fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4 },
  formBlock: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#6a6558', letterSpacing: 0.5 },
  codeInput: { fontFamily: "'DotGothic16', monospace", fontSize: 36, letterSpacing: '0.2em', textAlign: 'center', border: '2px solid #1a2332', borderRadius: 14, padding: '16px', outline: 'none', background: '#fff', textTransform: 'uppercase' },
  textInput: { border: '1.5px solid #e8e2d4', borderRadius: 12, padding: '14px', fontSize: 16, outline: 'none', background: '#fff' },
  activeMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 2px' },
  activeNum: { fontFamily: "'DotGothic16', monospace", fontSize: 13, color: '#6a6558', letterSpacing: 1 },
  roleBadge: { fontFamily: "'DotGothic16', monospace", fontSize: 11, background: '#1a2332', color: '#faf6f0', padding: '3px 8px', borderRadius: 6, letterSpacing: 2 },
  timerCard: { background: '#fff', borderRadius: 14, padding: 12, border: '1.5px solid #efe9db', display: 'flex', flexDirection: 'column', gap: 8 },
  timerTop: { display: 'flex', alignItems: 'center', gap: 8 },
  timerText: { fontSize: 14, fontWeight: 700, flex: 1 },
  answeredCount: { fontSize: 12, color: '#6a6558', fontWeight: 600 },
  timerBar: { height: 6, background: '#f0ebe2', borderRadius: 20, overflow: 'hidden' },
  timerFill: { height: '100%', transition: 'width 0.2s linear, background 0.3s' },
  qBig: { fontSize: 22, fontWeight: 700, lineHeight: 1.5, background: '#fff', borderRadius: 14, border: '1.5px solid #efe9db', padding: 18 },
  liveOpts: { display: 'flex', flexDirection: 'column', gap: 8 },
  liveOpt: { borderRadius: 12, border: '1.5px solid', padding: '10px 12px' },
  liveOptTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 },
  liveMark: { fontSize: 20, fontWeight: 700, flexShrink: 0 },
  liveText: { flex: 1, fontSize: 14, fontWeight: 500, lineHeight: 1.4 },
  liveCount: { fontSize: 16, fontWeight: 800, color: '#1a2332', display: 'inline-flex', alignItems: 'center', gap: 6 },
  qMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6a6558', fontFamily: "'DotGothic16', monospace", letterSpacing: 1 },
  questionText: { fontSize: 22, fontWeight: 700, lineHeight: 1.5, padding: '16px 4px 8px' },
  answerOpts: { display: 'flex', flexDirection: 'column', gap: 10 },
  answerBtn: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 16px', borderRadius: 14, border: '2px solid', textAlign: 'left', fontSize: 15, fontWeight: 500 },
  answerMark: { fontSize: 22, fontWeight: 700, flexShrink: 0 },
  answerText: { flex: 1, lineHeight: 1.4 },
  statusBanner: { padding: '12px 14px', borderRadius: 12, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' },
  waitCard: { background: '#fff', borderRadius: 20, padding: '40px 24px', border: '1.5px solid #efe9db', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 20 },
  spinnerWrap: { display: 'flex', gap: 6, marginBottom: 4 },
  spinnerDot: { width: 10, height: 10, borderRadius: '50%', background: '#e85d2f', animation: 'dotBounce 1.2s infinite ease-in-out' },
  waitTitle: { fontSize: 17, fontWeight: 700, color: '#1a2332' },
  waitSub: { fontSize: 14, color: '#6a6558' },
  waitMetaRow: { display: 'flex', gap: 8, fontSize: 12, color: '#9a9385', marginTop: 8, fontFamily: "'DotGothic16', monospace", letterSpacing: 1 },
  doneWrap: { textAlign: 'center', padding: '40px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  doneIcon: { width: 72, height: 72, borderRadius: '50%', background: '#e85d2f', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  doneTitle: { fontSize: 26, fontWeight: 800, margin: 0 },
  doneSub: { fontSize: 14, color: '#6a6558', margin: '0 0 4px' },
  scoreCard: { background: '#1a2332', color: '#faf6f0', borderRadius: 16, padding: '18px 28px', marginTop: 8, textAlign: 'center' },
  scoreLabel: { fontSize: 11, fontFamily: "'DotGothic16', monospace", letterSpacing: 2, opacity: 0.6, marginBottom: 4 },
  scoreBig: { fontSize: 42, fontWeight: 900, color: '#e85d2f' },
  scoreTotal: { fontSize: 18, color: '#faf6f0', opacity: 0.6, fontWeight: 500 },
  myAnsList: { display: 'flex', flexDirection: 'column', gap: 8 },
  myAnsRow: { background: '#fff', borderRadius: 12, padding: '12px 14px', border: '1.5px solid #efe9db' },
  myAnsHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  myAnsNum: { fontFamily: "'DotGothic16', monospace", fontSize: 12, color: '#e85d2f' },
  myAnsChip: { width: 36, height: 36, borderRadius: 10, border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  myAnsText: { fontSize: 14, color: '#1a2332', lineHeight: 1.5 },
  myAnsCorrect: { fontSize: 12, color: '#2fa368', fontWeight: 600, marginTop: 4 },
  tabs: { display: 'flex', background: '#fff', borderRadius: 14, padding: 4, border: '1.5px solid #efe9db' },
  tab: { flex: 1, padding: '10px', border: 'none', background: 'transparent', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#6a6558' },
  tabActive: { background: '#1a2332', color: '#faf6f0' },
  summaryList: { display: 'flex', flexDirection: 'column', gap: 12 },
  qResText: { fontSize: 15, fontWeight: 600, marginBottom: 14, lineHeight: 1.5 },
  bars: { display: 'flex', flexDirection: 'column', gap: 10 },
  barRow: { display: 'flex', gap: 10, alignItems: 'center' },
  barMark: { fontSize: 18, fontWeight: 700, width: 24, flexShrink: 0 },
  barBody: { flex: 1 },
  barTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, marginBottom: 4 },
  barOpt: { color: '#1a2332' },
  barCount: { fontWeight: 700, color: '#1a2332' },
  barTrack: { height: 8, background: '#f0ebe2', borderRadius: 10, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 10, transition: 'width 0.5s ease' },
  correctTag: { fontSize: 10, background: '#2fa368', color: '#fff', padding: '2px 6px', borderRadius: 10, marginLeft: 6, fontWeight: 700 },
  rankRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0ebe2' },
  rankPos: { width: 28, height: 28, borderRadius: 10, background: '#faf6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, fontFamily: "'DotGothic16', monospace" },
  rankName: { flex: 1, fontWeight: 600 },
  rankScore: { fontSize: 18, fontWeight: 800, color: '#e85d2f' },
  rankTotal: { fontSize: 12, color: '#9a9385', fontWeight: 500 },
  personHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  personName: { fontSize: 15, fontWeight: 700 },
  personCount: { fontSize: 12, color: '#9a9385' },
  personAns: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  ansChip: { width: 36, height: 36, borderRadius: 10, border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 },
  toast: { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#1a2332', color: '#faf6f0', padding: '12px 20px', borderRadius: 20, fontSize: 14, fontWeight: 600, animation: 'slideUp 0.3s ease', boxShadow: '0 10px 30px rgba(0,0,0,0.2)', zIndex: 100 }
};
