# Quizo

A browser-based quiz app for revising **Java** and **Spring Boot**. Practice by topic, run mixed quizzes, enable an optional per-question timer, earn points and streaks, and review mistakes—all offline in your browser.

## How to run

1. Open the project folder: `Quizo`
2. Open **`index.html`** in a browser (double-click the file, or right-click → Open with Chrome/Edge/Firefox)
3. Hard-refresh if the UI looks outdated: **Ctrl + F5**

No install, build, or server is required for the current version.

### Optional: local server

If you prefer a local URL (e.g. for Live Server in VS Code):

```bash
# from the Quizo folder — Python 3
python -m http.server 5500
```

Then visit `http://localhost:5500`.

## What’s included

- Topics: Java Core, OOP, Collections, Concurrency, JVM, Spring Core, Boot, Data/JPA, Web, Security  
- Optional timer, points, levels, streaks, and reset  
- Mistake review stored in the browser (`localStorage`)

For a multi-user / leaderboard roadmap, see [`REVAMP_PLAN.md`](./REVAMP_PLAN.md).
