# LifeHub Desktop

Native Mac, Windows, and Linux app — wraps the LifeHub web app (43 productivity tools) in a desktop shell with offline support, native menus, and auto-updates.

[Get LifeHub](https://trylifehub.com) · [Changelog](https://trylifehub.com/index.php/changelog/) · [Web app](https://lifehub-app.pages.dev/dashboard/)

---

## Download

| Platform | Format |
|---|---|
| **macOS (Apple Silicon)** | [.dmg](https://github.com/walymali/lifehub-desktop/releases/latest) |
| **Windows** | .exe installer (coming soon) |
| **Linux** | AppImage / .deb (coming soon) |

---

## Develop

```bash
git clone https://github.com/walymali/lifehub-desktop.git
cd lifehub-desktop
npm install
npm start    # launches the dev app
```

## Build installers locally

```bash
npm run build-mac      # Mac (.dmg + .zip)
npm run build-win      # Windows (.exe + portable)
npm run build-linux    # Linux (.AppImage + .deb)
```

Output lands in `dist/`.

## Release a new version

See [RELEASING.md](./RELEASING.md). Short version:

```bash
npm version patch
git push --follow-tags
```

GitHub Actions then builds for all 3 platforms and publishes to GitHub Releases. Customers' apps auto-update within 4 hours.

## Architecture

```
┌────────────────────────────────────────────────────────┐
│  LifeHub.app (Electron shell)                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  preload.js  →  exposes window.LIFEHUB_DESKTOP   │  │
│  │                                                   │  │
│  │  app/dashboard/index.html  (the web app + 43 tools)
│  │  ├─ lifehub-sdk.js  → license + usage tracking   │  │
│  │  ├─ i18n.js + locales/  → EN + AR with RTL       │  │
│  │  └─ tool dirs (habit-tracker, resume-builder, …) │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────┘
                         │
                         ↓ (license + usage)
            ┌────────────────────────────┐
            │  Cloudflare Worker         │
            │  api.lifehub.app / .workers.dev
            └────────────────────────────┘
                         ↓ (webhooks)
            ┌────────────────────────────┐
            │  WordPress + WooCommerce   │
            │  trylifehub.com            │
            └────────────────────────────┘
```

## Stack

- [Electron](https://electronjs.org) 41
- [electron-builder](https://www.electron.build) 25 — packaging
- [electron-updater](https://www.electron.build/auto-update) 6 — auto-updates via GitHub Releases
- Vanilla HTML/CSS/JS for the bundled tools (no React, no build step for tool sources)

## License

Proprietary — see https://trylifehub.com/terms
