# Simple Budget

A minimal, offline-first PWA to track expenses against a single recurring budget.

- One budget: amount, currency, weekly or monthly reset
- Add, edit and delete expenses
- Data stays on your device (`localStorage`); export/import as JSON in Settings
- No build step, no dependencies

**Live:** https://lkopczynski.github.io/Lok.SimpleBudget/

## Run locally

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Offline support needs HTTPS or `localhost`.

## Deploy

Pushed to `main` and served by GitHub Pages (Settings → Pages → branch `main`, `/ (root)`).

When changing app files, bump `CACHE` in `sw.js` so installed copies update.

## License

[MIT](LICENSE)
