# Simple Budget

A minimal, offline-first PWA to track expenses against a single recurring budget.

- One budget: amount, currency, weekly or monthly reset
- Add, edit and delete expenses
- Data stays on your device (`localStorage`); export/import as JSON in Settings
- No build step, no dependencies

**Live:** https://lkopczynski.github.io/Lok.SimpleBudget/

## Structure

```
app/                     the PWA (everything that gets deployed)
.github/workflows/       GitHub Pages deployment
.github/rulesets/        branch protection ruleset (import via repo settings)
```

## Run locally

```sh
python3 -m http.server 8080 -d app
```

Open http://localhost:8080. Offline support needs HTTPS or `localhost`.

## Deploy

Pushes to `main` that touch `app/` deploy via GitHub Actions (Settings → Pages → Source: **GitHub Actions**).

When changing app files, bump `CACHE` in `app/sw.js` so installed copies update.

## License

[MIT](LICENSE)
