/**
 * Quizo — quiz engine + points system
 */

const STORAGE_KEYS = {
  best: "quizo_best_score",
  wrong: "quizo_wrong_ids",
  points: "quizo_total_points",
  bestStreak: "quizo_best_streak",
  quizzes: "quizo_quiz_count",
  sound: "quizo_sound_enabled",
};

const POINTS = {
  easy: 10,
  medium: 20,
  hard: 30,
  streakBonus: 5,
  maxSpeedBonus: 15,
};

const XP_PER_LEVEL = 100;

/** @type {{
 *   topicId: string | 'mixed' | 'wrong',
 *   questions: typeof QUESTIONS,
 *   index: number,
 *   answers: (number|null)[],
 *   timedOut: boolean[],
 *   pointsEarned: number[],
 *   count: number | 'all',
 *   difficulty: string,
 *   timerSeconds: number | null,
 *   runPoints: number,
 *   streak: number,
 *   maxStreak: number,
 *   questionStartedAt: number
 * }} */
let state = null;

/** @type {ReturnType<typeof setInterval> | null} */
let timerInterval = null;
let timerRemaining = 0;
let audioContext = null;

// ─── Helpers ───────────────────────────────────────────────

function $(id) {
  return document.getElementById(id);
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getWrongIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.wrong) || "[]");
  } catch {
    return [];
  }
}

function saveWrongIds(ids) {
  localStorage.setItem(STORAGE_KEYS.wrong, JSON.stringify([...new Set(ids)]));
}

function addWrong(id) {
  const ids = getWrongIds();
  if (!ids.includes(id)) {
    ids.push(id);
    saveWrongIds(ids);
  }
}

function removeWrong(id) {
  saveWrongIds(getWrongIds().filter((x) => x !== id));
}

function getBest() {
  const v = localStorage.getItem(STORAGE_KEYS.best);
  return v == null ? null : Number(v);
}

function setBest(pct) {
  const prev = getBest();
  if (prev == null || pct > prev) {
    localStorage.setItem(STORAGE_KEYS.best, String(pct));
  }
}

function getTotalPoints() {
  return Number(localStorage.getItem(STORAGE_KEYS.points) || 0);
}

function setTotalPoints(n) {
  localStorage.setItem(STORAGE_KEYS.points, String(Math.max(0, Math.floor(n))));
}

function addTotalPoints(delta) {
  const next = getTotalPoints() + delta;
  setTotalPoints(next);
  return next;
}

function getBestStreak() {
  return Number(localStorage.getItem(STORAGE_KEYS.bestStreak) || 0);
}

function setBestStreak(n) {
  const prev = getBestStreak();
  if (n > prev) localStorage.setItem(STORAGE_KEYS.bestStreak, String(n));
}

function getQuizCount() {
  return Number(localStorage.getItem(STORAGE_KEYS.quizzes) || 0);
}

function bumpQuizCount() {
  localStorage.setItem(STORAGE_KEYS.quizzes, String(getQuizCount() + 1));
}

function levelFromPoints(pts) {
  return Math.floor(pts / XP_PER_LEVEL) + 1;
}

function xpProgress(pts) {
  const into = pts % XP_PER_LEVEL;
  return { into, need: XP_PER_LEVEL, pct: (into / XP_PER_LEVEL) * 100 };
}

function rankFromLevel(level) {
  if (level >= 20) return "Legend";
  if (level >= 15) return "Master";
  if (level >= 10) return "Expert";
  if (level >= 6) return "Pro";
  if (level >= 3) return "Coder";
  return "Rookie";
}

function basePointsFor(diff) {
  return POINTS[diff] || POINTS.medium;
}

function calcSpeedBonus() {
  if (!state?.timerSeconds) return 0;
  const ratio = Math.max(0, timerRemaining / state.timerSeconds);
  return Math.round(ratio * POINTS.maxSpeedBonus);
}

function topicById(id) {
  return TOPICS.find((t) => t.id === id);
}

function filterQuestions(topicId, difficulty) {
  let pool = QUESTIONS;
  if (topicId === "wrong") {
    const wrong = new Set(getWrongIds());
    pool = QUESTIONS.filter((q) => wrong.has(q.id));
  } else if (topicId && topicId !== "mixed") {
    pool = QUESTIONS.filter((q) => q.topic === topicId);
  }
  if (difficulty && difficulty !== "all") {
    pool = pool.filter((q) => q.difficulty === difficulty);
  }
  return pool;
}

function renderInline(html) {
  return html;
}

function isSoundEnabled() {
  const saved = localStorage.getItem(STORAGE_KEYS.sound);
  return saved == null ? true : saved === "1";
}

function setSoundEnabled(enabled) {
  localStorage.setItem(STORAGE_KEYS.sound, enabled ? "1" : "0");
  updateSoundToggle();
}

function updateSoundToggle() {
  const btn = $("btn-sound-toggle");
  if (!btn) return;
  const enabled = isSoundEnabled();
  btn.classList.toggle("muted", !enabled);
  btn.setAttribute("aria-pressed", String(!enabled));
  btn.textContent = enabled ? "Sound on" : "Sound off";
  btn.title = enabled ? "Mute answer sounds" : "Enable answer sounds";
}

function getAudioContext() {
  if (!isSoundEnabled()) return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone(freq, duration, type = "sine", gainValue = 0.14, startAt = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    ctx.currentTime + startAt + duration
  );
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration + 0.03);
}

function playCorrectSound() {
  if (!isSoundEnabled()) return;
  // Bright, celebratory major chord with a final high sparkle.
  playTone(523.25, 0.24, "sine", 0.18, 0);
  playTone(659.25, 0.26, "sine", 0.16, 0.06);
  playTone(783.99, 0.34, "sine", 0.18, 0.12);
  playTone(1046.5, 0.38, "triangle", 0.1, 0.2);
}

function playWrongSound() {
  if (!isSoundEnabled()) return;
  // A gentle, descending minor chime that signals a wrong answer.
  playTone(392, 0.2, "triangle", 0.15, 0);
  playTone(329.63, 0.24, "triangle", 0.14, 0.13);
  playTone(261.63, 0.38, "sine", 0.16, 0.28);
}

// ─── Interactive FX ────────────────────────────────────────

function showToast(message, type = "info") {
  const stack = $("toast-stack");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function floatPoints(text, x, y, bad = false) {
  const layer = $("fx-layer");
  const el = document.createElement("div");
  el.className = `float-pts${bad ? " bad" : ""}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function spawnSparks(x, y, color = "#fbbf24") {
  const layer = $("fx-layer");
  for (let i = 0; i < 12; i++) {
    const s = document.createElement("div");
    s.className = "spark";
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 28 + Math.random() * 40;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.background = color;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    layer.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

function animateCount(el, from, to, ms = 600) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ─── Timer ─────────────────────────────────────────────────

function stopTimer() {
  if (timerInterval != null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerUI() {
  const el = $("quiz-timer");
  const valueEl = $("timer-value");
  const bar = $("timer-bar-fill");
  if (!state?.timerSeconds) return;

  valueEl.textContent = String(Math.max(0, timerRemaining));
  const pct = (timerRemaining / state.timerSeconds) * 100;
  bar.style.width = `${pct}%`;

  el.classList.remove("warn", "danger");
  if (timerRemaining <= 5) el.classList.add("danger");
  else if (timerRemaining <= Math.ceil(state.timerSeconds / 3)) el.classList.add("warn");
}

function startTimer() {
  stopTimer();
  if (!state?.timerSeconds) {
    $("quiz-timer").classList.add("hidden");
    return;
  }

  $("quiz-timer").classList.remove("hidden");
  timerRemaining = state.timerSeconds;
  updateTimerUI();

  timerInterval = setInterval(() => {
    timerRemaining -= 1;
    updateTimerUI();
    if (timerRemaining <= 0) {
      stopTimer();
      onTimeUp();
    }
  }, 1000);
}

function onTimeUp() {
  if (!state || state.answers[state.index] !== null) return;

  const q = state.questions[state.index];
  state.answers[state.index] = null;
  state.timedOut[state.index] = true;
  state.pointsEarned[state.index] = 0;
  state.streak = 0;
  updateRunScoreUI();
  addWrong(q.id);

  const card = $("question-card");
  card.classList.remove("correct-flash", "wrong-flash");
  void card.offsetWidth;
  card.classList.add("wrong-flash");

  const optionBtns = document.querySelectorAll(".option");
  optionBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add("correct");
    else btn.classList.add("dimmed");
  });

  $("explanation-text").innerHTML =
    `<strong style="color:var(--red)">Time's up! +0 pts</strong> ` +
    renderInline(q.explanation);
  $("explanation").classList.remove("hidden");
  $("btn-next").classList.remove("hidden");

  showToast("Time's up · +0 pts", "error");
  const rect = card.getBoundingClientRect();
  floatPoints("Time!", rect.left + rect.width / 2, rect.top + 40, true);

  const total = state.questions.length;
  $("progress-fill").style.width = `${((state.index + 1) / total) * 100}%`;
}

// ─── Home ──────────────────────────────────────────────────

function renderHome() {
  $("stat-total-qs").textContent = QUESTIONS.length;
  $("stat-topics").textContent = TOPICS.length;

  const pts = getTotalPoints();
  const level = levelFromPoints(pts);
  const xp = xpProgress(pts);
  const best = getBest();

  $("stat-points").textContent = String(pts);
  $("stat-level").textContent = String(level);
  $("stat-xp-label").textContent = `${xp.into} / ${xp.need} XP to level ${level + 1}`;
  $("xp-bar-fill").style.width = `${xp.pct}%`;
  $("stat-best").textContent = best == null ? "—" : `${best}%`;
  $("stat-streak-best").textContent = String(getBestStreak());
  $("stat-quizzes").textContent = String(getQuizCount());
  $("stat-rank").textContent = rankFromLevel(level);

  const circ = 2 * Math.PI * 34;
  const lvlFg = $("lvl-fg");
  lvlFg.style.strokeDasharray = String(circ);
  lvlFg.style.strokeDashoffset = String(circ * (1 - xp.pct / 100));

  const wrong = getWrongIds();
  $("wrong-count").textContent =
    wrong.length === 0
      ? "No mistakes yet"
      : `${wrong.length} question${wrong.length === 1 ? "" : "s"} to revisit`;

  const accents = [
    "#4da3ff",
    "#7c6cff",
    "#34d399",
    "#fbbf24",
    "#f472b6",
    "#22d3ee",
    "#a78bfa",
    "#fb7185",
    "#60a5fa",
    "#2dd4bf",
  ];

  const grid = $("topic-grid");
  grid.innerHTML = "";
  TOPICS.forEach((topic, i) => {
    const count = QUESTIONS.filter((q) => q.topic === topic.id).length;
    const accent = accents[i % accents.length];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "topic-card interactive-btn";
    btn.style.setProperty("--topic-accent", accent);
    btn.style.animationDelay = `${i * 0.03}s`;
    btn.innerHTML = `
      <span class="topic-icon" style="border-color:${accent}33;background:${accent}18">${topic.icon}</span>
      <div class="topic-name">${topic.name}</div>
      <div class="topic-count">${count} questions</div>
    `;
    btn.addEventListener("click", () => openSetup(topic.id));
    grid.appendChild(btn);
  });
}

// ─── Setup ─────────────────────────────────────────────────

function openSetup(topicId, defaults = {}) {
  state = {
    topicId,
    questions: [],
    index: 0,
    answers: [],
    timedOut: [],
    pointsEarned: [],
    count: defaults.count ?? 10,
    difficulty: defaults.difficulty ?? "all",
    timerSeconds: defaults.timerSeconds ?? null,
    runPoints: 0,
    streak: 0,
    maxStreak: 0,
    questionStartedAt: 0,
  };

  const title = $("setup-title");
  const desc = $("setup-desc");

  if (topicId === "mixed") {
    title.textContent = "Mixed Practice";
    desc.textContent = "Random questions across all Java & Spring Boot topics.";
  } else if (topicId === "wrong") {
    title.textContent = "Review Mistakes";
    desc.textContent = "Revisit questions you got wrong in previous sessions.";
  } else {
    const t = topicById(topicId);
    title.textContent = `${t.icon} ${t.name}`;
    desc.textContent = t.description;
  }

  const countVal = state.count === "all" ? "all" : String(state.count);
  document.querySelectorAll(".count-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.count === countVal);
  });
  document.querySelectorAll(".diff-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.diff === state.difficulty);
  });
  const timerVal = state.timerSeconds == null ? "off" : String(state.timerSeconds);
  document.querySelectorAll(".timer-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.timer === timerVal);
  });

  updateSetupMeta();
  showScreen("screen-setup");
}

function updateSetupMeta() {
  const pool = filterQuestions(state.topicId, state.difficulty);
  const n =
    state.count === "all" ? pool.length : Math.min(Number(state.count), pool.length);
  const timerNote =
    state.timerSeconds == null
      ? " · no timer"
      : ` · ${state.timerSeconds}s · speed bonus on`;
  $("setup-meta").textContent =
    pool.length === 0
      ? "No questions match these filters"
      : `${n} of ${pool.length} available will be asked${timerNote}`;
  $("btn-start-quiz").disabled = pool.length === 0;
  $("btn-start-quiz").style.opacity = pool.length === 0 ? "0.5" : "1";
}

function startQuiz() {
  let pool = filterQuestions(state.topicId, state.difficulty);
  pool = shuffle(pool);
  if (state.count !== "all") {
    pool = pool.slice(0, Number(state.count));
  }
  if (pool.length === 0) return;

  state.questions = pool;
  state.index = 0;
  state.answers = Array(pool.length).fill(null);
  state.timedOut = Array(pool.length).fill(false);
  state.pointsEarned = Array(pool.length).fill(0);
  state.runPoints = 0;
  state.streak = 0;
  state.maxStreak = 0;
  updateRunScoreUI();
  showScreen("screen-quiz");
  renderQuestion();
}

function updateRunScoreUI() {
  const val = $("run-points-val");
  if (val) val.textContent = String(state.runPoints);

  const streakEl = $("run-streak");
  const streakVal = $("run-streak-val");
  if (state.streak >= 2) {
    streakEl.classList.remove("hidden");
    streakVal.textContent = String(state.streak);
    streakEl.classList.remove("hot");
    void streakEl.offsetWidth;
    streakEl.classList.add("hot");
  } else {
    streakEl.classList.add("hidden");
  }
}

// ─── Quiz ──────────────────────────────────────────────────

function renderQuestion() {
  const q = state.questions[state.index];
  const total = state.questions.length;
  const num = state.index + 1;

  $("progress-fill").style.width = `${((num - 1) / total) * 100}%`;
  $("progress-text").textContent = `${num} / ${total}`;

  const topic = topicById(q.topic);
  $("quiz-topic-badge").textContent = topic ? topic.name : q.topic;

  const diffBadge = $("quiz-diff-badge");
  diffBadge.textContent = q.difficulty;
  diffBadge.className = `badge badge-diff ${q.difficulty}`;

  $("pts-preview").textContent = `+${basePointsFor(q.difficulty)} pts`;

  $("question-text").innerHTML = renderInline(q.question);
  $("explanation").classList.add("hidden");
  $("btn-next").classList.add("hidden");
  $("btn-next").textContent =
    state.index === total - 1 ? "See Results" : "Next Question";

  const card = $("question-card");
  card.classList.remove("correct-flash", "wrong-flash");

  const optionsEl = $("options");
  optionsEl.innerHTML = "";
  const letters = ["A", "B", "C", "D"];

  q.options.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option";
    btn.style.animation = `fadeIn 0.3s ease ${i * 0.05}s both`;
    btn.innerHTML = `
      <span class="option-letter">${letters[i]}</span>
      <span class="option-text">${renderInline(opt)}</span>
    `;
    btn.addEventListener("pointerdown", (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--rx", `${((e.clientX - r.left) / r.width) * 100}%`);
      btn.style.setProperty("--ry", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
    btn.addEventListener("click", () => selectAnswer(i, btn));
    optionsEl.appendChild(btn);
  });

  state.questionStartedAt = Date.now();
  startTimer();
}

function selectAnswer(choice, clickedBtn) {
  if (state.answers[state.index] !== null) return;

  stopTimer();

  const q = state.questions[state.index];
  state.answers[state.index] = choice;
  state.timedOut[state.index] = false;
  const correct = choice === q.answer;

  let earned = 0;
  let breakdown = "";

  if (correct) {
    removeWrong(q.id);
    state.streak += 1;
    state.maxStreak = Math.max(state.maxStreak, state.streak);

    const base = basePointsFor(q.difficulty);
    const streakPts =
      state.streak > 1 ? (state.streak - 1) * POINTS.streakBonus : 0;
    const speed = calcSpeedBonus();
    earned = base + streakPts + speed;
    breakdown = `+${base}`;
    if (streakPts) breakdown += ` · streak +${streakPts}`;
    if (speed) breakdown += ` · speed +${speed}`;
  } else {
    addWrong(q.id);
    state.streak = 0;
    earned = 0;
  }

  state.pointsEarned[state.index] = earned;
  state.runPoints += earned;
  updateRunScoreUI();

  const card = $("question-card");
  card.classList.remove("correct-flash", "wrong-flash");
  void card.offsetWidth;
  card.classList.add(correct ? "correct-flash" : "wrong-flash");

  const optionBtns = document.querySelectorAll(".option");
  optionBtns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add("correct");
    else if (i === choice) btn.classList.add("wrong");
    else btn.classList.add("dimmed");
  });

  const ptsChip = $("run-points");
  ptsChip.classList.remove("bump");
  void ptsChip.offsetWidth;
  if (earned > 0) ptsChip.classList.add("bump");

  const rect = (clickedBtn || card).getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  if (correct) {
    playCorrectSound();
    floatPoints(`+${earned}`, cx, cy);
    spawnSparks(cx, cy, state.streak >= 3 ? "#fb7185" : "#fbbf24");
    showToast(`${breakdown}`, "points");
    $("explanation-text").innerHTML =
      `<strong style="color:var(--green)">Correct! +${earned} pts</strong> — ` +
      renderInline(q.explanation);
  } else {
    playWrongSound();
    floatPoints("+0", cx, cy, true);
    showToast("Incorrect · +0 pts", "error");
    $("explanation-text").innerHTML =
      `<strong style="color:var(--red)">Incorrect · +0 pts</strong> — ` +
      renderInline(q.explanation);
  }

  $("explanation").classList.remove("hidden");
  $("btn-next").classList.remove("hidden");

  const total = state.questions.length;
  $("progress-fill").style.width = `${((state.index + 1) / total) * 100}%`;
}

function nextQuestion() {
  stopTimer();
  if (state.index < state.questions.length - 1) {
    state.index += 1;
    renderQuestion();
  } else {
    showResults();
  }
}

// ─── Results ───────────────────────────────────────────────

function showResults() {
  stopTimer();
  $("quiz-timer").classList.add("hidden");

  const total = state.questions.length;
  let correct = 0;
  let timedOutCount = 0;
  let pointsThisRun = 0;
  const byTopic = {};

  state.questions.forEach((q, i) => {
    const ok = state.answers[i] === q.answer;
    if (ok) correct += 1;
    if (state.timedOut[i]) timedOutCount += 1;
    pointsThisRun += state.pointsEarned[i] || 0;
    const tid = q.topic;
    if (!byTopic[tid]) byTopic[tid] = { correct: 0, total: 0 };
    byTopic[tid].total += 1;
    if (ok) byTopic[tid].correct += 1;
  });

  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
  setBest(pct);
  setBestStreak(state.maxStreak);
  bumpQuizCount();

  const prevTotal = getTotalPoints();
  const newTotal = addTotalPoints(pointsThisRun);
  const prevLevel = levelFromPoints(prevTotal);
  const newLevel = levelFromPoints(newTotal);

  renderHome();

  $("score-pct").textContent = `${pct}%`;
  $("score-frac").textContent = `${correct}/${total}`;

  const rpe = $("rpe-value");
  rpe.textContent = "+0";
  animateCount(rpe, 0, pointsThisRun, 800);
  // keep + prefix
  setTimeout(() => {
    rpe.textContent = `+${pointsThisRun}`;
  }, 820);

  const circumference = 2 * Math.PI * 52;
  const ring = $("ring-fg");
  ring.style.strokeDasharray = String(circumference);
  ring.style.strokeDashoffset = String(circumference);
  const color =
    pct >= 80 ? "var(--green)" : pct >= 50 ? "var(--accent)" : "var(--red)";
  ring.style.stroke = color;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ring.style.strokeDashoffset = String(circumference * (1 - pct / 100));
    });
  });

  let title, sub;
  if (pct === 100) {
    title = "Perfect score!";
    sub = `You crushed every question and earned ${pointsThisRun} points.`;
  } else if (pct >= 80) {
    title = "Strong work!";
    sub = `${pointsThisRun} points in the bank. Polish the misses next.`;
  } else if (pct >= 50) {
    title = "Good start";
    sub = `+${pointsThisRun} pts — review explanations and climb the ranks.`;
  } else {
    title = "Keep going";
    sub = `+${pointsThisRun} pts. Revision is a loop — try again.`;
  }
  if (newLevel > prevLevel) {
    title = `Level up! → ${newLevel}`;
    sub = `You reached level ${newLevel} (${rankFromLevel(newLevel)}) with +${pointsThisRun} pts this run.`;
    showToast(`🎉 Level ${newLevel} unlocked!`, "success");
    spawnSparks(window.innerWidth / 2, window.innerHeight * 0.28, "#f472b6");
  }

  $("results-title").textContent = title;
  $("results-sub").textContent = sub;

  const breakdown = $("results-breakdown");
  breakdown.innerHTML = `
    <div class="breakdown-row">
      <span class="breakdown-label">★ Points this run</span>
      <span class="breakdown-value good">+${pointsThisRun}</span>
    </div>
    <div class="breakdown-row">
      <span class="breakdown-label">Total points</span>
      <span class="breakdown-value">${newTotal}</span>
    </div>
    <div class="breakdown-row">
      <span class="breakdown-label">Correct</span>
      <span class="breakdown-value good">${correct}</span>
    </div>
    <div class="breakdown-row">
      <span class="breakdown-label">Incorrect</span>
      <span class="breakdown-value bad">${total - correct}</span>
    </div>
    <div class="breakdown-row">
      <span class="breakdown-label">Best streak this run</span>
      <span class="breakdown-value">${state.maxStreak}</span>
    </div>
  `;

  if (state.timerSeconds != null) {
    const tRow = document.createElement("div");
    tRow.className = "breakdown-row";
    tRow.innerHTML = `
      <span class="breakdown-label">Timed out</span>
      <span class="breakdown-value ${timedOutCount ? "bad" : ""}">${timedOutCount}</span>
    `;
    breakdown.appendChild(tRow);
  }

  Object.entries(byTopic).forEach(([tid, stats]) => {
    const t = topicById(tid);
    const row = document.createElement("div");
    row.className = "breakdown-row";
    row.innerHTML = `
      <span class="breakdown-label">${t ? t.icon + " " + t.name : tid}</span>
      <span class="breakdown-value">${stats.correct}/${stats.total}</span>
    `;
    breakdown.appendChild(row);
  });

  showScreen("screen-results");

  if (pointsThisRun > 0) {
    showToast(`+${pointsThisRun} points saved`, "points");
  }
}

// ─── Review ────────────────────────────────────────────────

function showReview() {
  const list = $("review-list");
  list.innerHTML = "";

  state.questions.forEach((q, i) => {
    const choice = state.answers[i];
    const timedOut = state.timedOut[i];
    const ok = choice === q.answer;
    const pts = state.pointsEarned[i] || 0;
    const item = document.createElement("div");
    item.className = `review-item ${ok ? "correct" : "wrong"}`;
    item.style.animation = `fadeIn 0.3s ease ${i * 0.04}s both`;

    const yourAns =
      choice == null
        ? timedOut
          ? "— (timed out)"
          : "—"
        : renderInline(q.options[choice]);
    const rightAns = renderInline(q.options[q.answer]);
    const statusLabel = ok ? "Correct" : timedOut ? "Timed out" : "Incorrect";

    item.innerHTML = `
      <div class="review-header">
        <span class="review-num">Q${i + 1}</span>
        <span class="review-status ${ok ? "ok" : "no"}">${statusLabel}</span>
        <span class="badge">${topicById(q.topic)?.name || q.topic}</span>
        <span class="badge" style="background:rgba(251,191,36,0.12);color:#fbbf24;border-color:rgba(251,191,36,0.3)">+${pts} pts</span>
      </div>
      <div class="review-q">${renderInline(q.question)}</div>
      <div class="review-answers">
        ${
          ok
            ? `<span class="right">Answer: ${rightAns}</span>`
            : `<div class="your">Your answer: ${yourAns}</div>
               <div class="right">Correct: ${rightAns}</div>`
        }
      </div>
      <div class="review-exp">${renderInline(q.explanation)}</div>
    `;
    list.appendChild(item);
  });

  showScreen("screen-review");
}

// ─── Reset points ──────────────────────────────────────────

function openResetModal() {
  $("reset-also-mistakes").checked = false;
  $("reset-modal").classList.remove("hidden");
}

function closeResetModal() {
  $("reset-modal").classList.add("hidden");
}

function confirmReset() {
  setTotalPoints(0);
  localStorage.setItem(STORAGE_KEYS.bestStreak, "0");
  localStorage.setItem(STORAGE_KEYS.quizzes, "0");

  if ($("reset-also-mistakes").checked) {
    localStorage.removeItem(STORAGE_KEYS.wrong);
    localStorage.removeItem(STORAGE_KEYS.best);
  }

  closeResetModal();
  renderHome();

  const ptsEl = $("stat-points");
  ptsEl.classList.remove("pop");
  void ptsEl.offsetWidth;
  ptsEl.classList.add("pop");

  showToast("Points reset to 0", "info");
  spawnSparks(window.innerWidth / 2, 180, "#94a3b8");
}

// ─── Init ──────────────────────────────────────────────────

function init() {
  renderHome();
  updateSoundToggle();

  $("btn-sound-toggle").addEventListener("click", () => {
    setSoundEnabled(!isSoundEnabled());
    showToast(isSoundEnabled() ? "Sound enabled" : "Sound muted", "info");
  });

  $("btn-mixed").addEventListener("click", () => {
    openSetup("mixed", { count: 15 });
  });

  $("btn-wrong").addEventListener("click", () => {
    openSetup("wrong");
  });

  $("setup-back").addEventListener("click", () => {
    stopTimer();
    renderHome();
    showScreen("screen-home");
  });

  document.querySelectorAll(".count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".count-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.count = btn.dataset.count === "all" ? "all" : Number(btn.dataset.count);
      updateSetupMeta();
    });
  });

  document.querySelectorAll(".diff-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".diff-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.difficulty = btn.dataset.diff;
      updateSetupMeta();
    });
  });

  document.querySelectorAll(".timer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".timer-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.timerSeconds =
        btn.dataset.timer === "off" ? null : Number(btn.dataset.timer);
      updateSetupMeta();
    });
  });

  $("btn-start-quiz").addEventListener("click", startQuiz);
  $("btn-next").addEventListener("click", nextQuestion);

  $("btn-quit").addEventListener("click", () => {
    if (
      confirm(
        state?.runPoints
          ? `Quit quiz? You'll keep the ${state.runPoints} pts already earned this run.`
          : "Quit this quiz? No points earned yet."
      )
    ) {
      stopTimer();
      if (state?.runPoints > 0) {
        addTotalPoints(state.runPoints);
        setBestStreak(state.maxStreak || 0);
        showToast(`+${state.runPoints} pts saved · quiz quit`, "points");
      } else {
        showToast("Quiz quit", "info");
      }
      renderHome();
      showScreen("screen-home");
    }
  });

  $("btn-retry").addEventListener("click", () => {
    if (!state) {
      showScreen("screen-home");
      return;
    }
    openSetup(state.topicId, {
      count: state.count,
      difficulty: state.difficulty,
      timerSeconds: state.timerSeconds,
    });
  });

  $("btn-review").addEventListener("click", showReview);

  $("btn-home").addEventListener("click", () => {
    stopTimer();
    renderHome();
    showScreen("screen-home");
  });

  $("review-back").addEventListener("click", () => showScreen("screen-results"));
  $("btn-review-home").addEventListener("click", () => {
    renderHome();
    showScreen("screen-home");
  });

  $("btn-reset-points").addEventListener("click", openResetModal);
  $("btn-reset-cancel").addEventListener("click", closeResetModal);
  $("btn-reset-confirm").addEventListener("click", confirmReset);
  $("reset-modal").addEventListener("click", (e) => {
    if (e.target === $("reset-modal")) closeResetModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("reset-modal").classList.contains("hidden")) {
      closeResetModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
