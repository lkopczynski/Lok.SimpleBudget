# Simple Budget

A minimal, offline-first PWA to track expenses against a single recurring budget.

- One budget: amount, currency, weekly or monthly reset
- Add, edit and delete expenses
- Dedicated mobile screens for setup, settings, and adding or editing expenses
- Confirm before discarding unsaved expense or settings changes
- Return to the top of the budget after closing a screen
- Data stays on your device (`localStorage`); export/import as JSON in Settings
- English, German and French, selected from the device's primary language; English fallback
- No build step, no dependencies

**Live:** https://lkopczynski.github.io/Lok.SimpleBudget/

## Structure

```
app/                     the PWA (everything that gets deployed)
	index.html             app shell
	views/                 budget, expense, setup, settings, and shared field markup
	locales/               centralized English, German and French translations
.github/workflows/       GitHub Pages deployment
.github/rulesets/        branch protection ruleset (import via repo settings)
```

## Run locally

```sh
python3 -m http.server 8080 -d app
```

Open http://localhost:8080. Offline support needs HTTPS or `localhost`.

Views are loaded once at startup and cached for offline use. Hash routes keep navigation
inside the app without page reloads or server rewrites, including on GitHub Pages:
`#/budget`, `#/setup`, `#/settings`, `#/expenses/new`, and `#/expenses/<id>`.
Reloading or opening a route directly preserves the selected view; setup is required
before accessing other views. Missing expenses and unknown routes return to the budget.

Regional language variants such as `de-CH` and `fr-CA` use German and French text
with regional date and currency formatting. Unsupported or undetected languages use
English. All translations are cached for offline use.

## Deploy

Pushes to `main` that touch `app/` deploy via GitHub Actions (Settings → Pages → Source: **GitHub Actions**).

When changing app files, bump `CACHE` in `app/sw.js` so installed copies update.

## License

[MIT](LICENSE)
