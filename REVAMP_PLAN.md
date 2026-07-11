# Quizo — Multi-User Revamp Plan

Product and technical plan for evolving Quizo from a solo browser quiz into a multi-user revision app with **profiles**, **ranks**, **comparison**, and a **leaderboard**.

> Status: planning only. Implement when explicitly requested.

---

## 1. Current state

| Aspect | Today |
|--------|--------|
| Stack | Static `HTML` / `CSS` / `JS` |
| Data | `localStorage` (points, mistakes, best score) |
| Users | Single person per browser |
| Scoring | Client-side |

**Limitation:** Local storage cannot support shared ranks, fair leaderboards, or cross-device profiles. Multi-user features need **auth**, a **backend**, and a **shared database**. Critical rule: **the server must grade answers and award points** so scores cannot be faked in the browser.

---

## 2. Product goals

### 2.1 Profile

- Display name and optional avatar  
- Level, total points, rank title  
- Best streak, quizzes played, accuracy  
- Per-topic breakdown (e.g. Spring Boot 72%)  
- Public profile route (e.g. `/u/akash`)

### 2.2 Multi-user ranks

- Same ranking rules for everyone  
- Rank derived from server-side totals (points / weekly points)  
- Visible on home (“You’re #47”) and on profile  

### 2.3 Compare

- Search by username or open a compare link  
- Side-by-side: points, level, accuracy, best streak, strongest topic  

### 2.4 Leaderboard

| Board | Purpose |
|-------|---------|
| **Global** | All-time points |
| **Weekly** | Resets each week — keeps competition fresh |
| **Topic** | Optional: e.g. “Spring Security this week” |

Each row: rank, name, level, points, optional streak badge.

### 2.5 Scoring (keep spirit of current app)

| Event | Points (suggested) |
|-------|--------------------|
| Easy correct | +10 |
| Medium correct | +20 |
| Hard correct | +30 |
| Streak (2nd+ correct in a row) | +5 each |
| Speed bonus (timer on) | up to +15 |
| Wrong / timeout | +0 |

- Level: e.g. every **100 XP** → next level  
- Ranks (example): Rookie → Coder → Pro → Expert → Master → Legend  
- **Reset points:** user can reset **own** stats; never others’. Optional admin tools later.

### 2.6 Guest vs logged-in (optional)

- Guest: practice like today (local or anonymous session)  
- Logged-in: points count toward profile and leaderboards  

---

## 3. Why not only localStorage?

| Feature | Needs |
|---------|--------|
| Profile across devices | User account + DB |
| Fair multi-user ranks | Server-side totals |
| Compare people | Shared user records |
| Leaderboard | Ordered queries on shared scores |

Client can still show animations, timer UI, and optimistic feedback; **final score is always server-computed**.

---

## 4. Recommended tech stack

### Option A — Recommended (learn Java/Spring + solid product)

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **React + Vite + TypeScript** | Components for quiz, profile, board; type-safe |
| Styling | **Tailwind CSS** | Fast, consistent UI |
| Backend | **Spring Boot 3** | Matches revision domain; one stack to study |
| Auth | **Spring Security + JWT** (or HTTP-only session cookies) | Profiles need identity |
| Database | **PostgreSQL** | Users, attempts, leaderboards |
| Persistence | **Spring Data JPA** | Natural fit with Spring learning |
| API style | REST | Simple, clear contracts |
| Deploy | FE: Vercel/Netlify · API+DB: Railway / Render / Fly.io | Easy to start |

### Option B — Ship faster (less Spring practice)

| Layer | Choice |
|-------|--------|
| Full stack | **Next.js (App Router) + TypeScript** |
| DB + auth | **Supabase** (Postgres + Auth + RLS) |
| UI | Tailwind + **shadcn/ui** |

### Option C — Minimal multi-user

| Layer | Choice |
|-------|--------|
| Frontend | Current SPA or React |
| Backend | **Firebase** (Auth + Firestore) |
| Leaderboard | Order-by `points` queries |

**Default recommendation for this project: Option A.**

---

## 5. High-level architecture (Option A)

```
Browser (React + TS)
        │  JWT / session
        ▼
Spring Boot API
  ├── Auth (register / login / me)
  ├── Users / profiles
  ├── Quiz (start / submit answers)
  ├── Leaderboard (global / weekly / topic)
  └── Compare (userA vs userB)
        ▼
PostgreSQL
  users, user_stats, quiz_attempts,
  attempt_answers, weekly_scores
```

### Quiz scoring flow (fair)

1. Client loads quiz config / questions (or IDs) from API.  
2. User answers in the UI (timer, animations stay client-side).  
3. Client **submits answers** to the server.  
4. Server grades, applies streak/speed rules, updates stats.  
5. Leaderboard and profile read **server** totals only.

---

## 6. Minimal data model

### `users`

- `id`, `email`, `username` (unique), `password_hash`  
- `avatar_url` (nullable)  
- `created_at`

### `user_stats`

- `user_id` (PK/FK)  
- `total_points`, `level`  
- `best_streak`, `quizzes_played`  
- `correct_count`, `answered_count` (for accuracy)  
- `updated_at`

### `quiz_attempts`

- `id`, `user_id`  
- `topic` (or `mixed` / `wrong`)  
- `difficulty_filter`, `timer_seconds`  
- `score_pct`, `points_earned`, `max_streak`  
- `started_at`, `finished_at`

### `attempt_answers`

- `id`, `attempt_id`, `question_id`  
- `chosen_index` (nullable if timeout)  
- `correct` (boolean)  
- `points`, `timed_out`

### `weekly_scores`

- `user_id`, `week_start` (date)  
- `points`  
- Unique `(user_id, week_start)`

**Questions:** keep as versioned JSON/seed files initially; migrate to a `questions` table later if needed.

---

## 7. API sketch (REST)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Get token / session |
| `GET` | `/api/me` | Current user + stats |
| `GET` | `/api/users/{username}` | Public profile |
| `GET` | `/api/quiz/questions` | Filtered random set (ids + content) |
| `POST` | `/api/quiz/attempts` | Submit attempt → graded result |
| `GET` | `/api/leaderboard?scope=global\|weekly&topic=` | Ranked list |
| `GET` | `/api/compare?a={user}&b={user}` | Side-by-side stats |
| `POST` | `/api/me/reset-stats` | Reset own points (optional flags) |

Exact payloads can be defined at implementation time.

---

## 8. Frontend structure (React)

Suggested areas:

- `/` — Home (topics, your rank chip, CTA)  
- `/quiz/...` — Setup + play + results  
- `/leaderboard` — Global / weekly tabs  
- `/u/:username` — Public profile  
- `/compare` — Pick two users  
- `/login`, `/register` — Auth  

Reuse current UX ideas: timer option, points pops, streaks, topic grid, review mistakes (mistakes can later sync per user on server).

---

## 9. Phased delivery

| Phase | Deliverable | Outcome |
|-------|-------------|---------|
| **0** | Keep static Quizo as v1 prototype | No rewrite required yet |
| **1** | Spring Boot + Postgres + register/login | Real users |
| **2** | Quiz submit + server scoring + `user_stats` | Fair points |
| **3** | Profile page (`/u/:username`) | Identity & progress |
| **4** | Global + weekly leaderboard | Competition |
| **5** | Compare two users | Social / peer learning |
| **6** | Polish (avatars, topic boards, badges, friends) | Retention |

Do **not** redesign the entire UI before Phase 1 API works.

---

## 10. Security & fairness checklist

- [ ] Passwords hashed (e.g. BCrypt)  
- [ ] Never trust client-sent “I earned 9999 points”  
- [ ] Rate-limit register / login / submit  
- [ ] CORS locked to frontend origin  
- [ ] JWT expiry + refresh strategy (or secure cookies)  
- [ ] Public profile: only non-sensitive fields  
- [ ] Reset stats: authenticated user, own data only  

---

## 11. Deployment sketch

```
[ React build ] ──► Static host (Vercel / Netlify / Cloudflare Pages)
[ Spring Boot ] ──► Container / JVM host (Railway, Render, Fly, VPS)
[ PostgreSQL  ] ──► Managed DB (same provider or Neon/Supabase DB-only)
```

Environment: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, etc.

---

## 12. Repo layout (future monorepo idea)

```
Quizo/
  REVAMP_PLAN.md          ← this file
  apps/
    web/                  ← React + Vite + TS
    api/                  ← Spring Boot
  packages/
    questions/            ← shared question bank (JSON) optional
  README.md
```

Until the revamp starts, the existing root files (`index.html`, `app.js`, `questions.js`, `styles.css`) remain the **v1** app.

---

## 13. Success metrics (later)

- Registered users  
- Weekly active players  
- Average accuracy / points per attempt  
- Leaderboard engagement (views, return visits)  
- Topic coverage (which topics people practice)

---

## 14. Decision log

| Decision | Choice | Notes |
|----------|--------|-------|
| Primary stack | **Option A** (React + Spring Boot + Postgres) | Aligns with Java/Spring revision goals |
| Scoring authority | **Server** | Anti-cheat baseline |
| First multi-user features after auth | Profile → Leaderboard → Compare | Phases 3–5 |
| Weekly board | Yes | Avoid permanent #1 lock-in |

---

## 15. Next step (when ready to build)

1. Confirm **Option A** (or B/C).  
2. Scaffold `api` (Spring Boot) + `web` (Vite React).  
3. Implement Phase 1: auth + health check.  
4. Port question bank and server-side grading (Phase 2).  

**Do not implement until explicitly requested.**

---

## 16. Summary

- Today’s Quizo is a strong **solo revision prototype**.  
- Profiles, multi-user ranks, compare, and leaderboards need **auth + API + PostgreSQL**.  
- Best path for this project: **React + TypeScript frontend**, **Spring Boot API**, **server-side scoring**, phased delivery from auth → stats → profile → leaderboard → compare.  
- This document is the source of truth for that plan until implementation begins.
