# M&T Drinks Tracker

A simple, offline-capable Progressive Web App (PWA) for tracking drinks, designed for Moe and Trish.

## Features

- **Drink Logging**: Quickly log Beer, Wine, Cocktails, or Other drinks.
- **Multi-User**: Switch between Moe and Trish profiles.
- **Analytics**: View daily, weekly, and monthly stats.
- **Natural Language Query**: Ask questions like "How many drinks did I have last week?" or "Zero streak".
- **Responsive Design**: Mobile-first UI with dark mode support (future).
- **Offline Capable**: Works without an internet connection (cached assets).

## Setup & Development

This is a static web application. No build step is strictly required to run it, but a local server is recommended.

### Prerequisites

- Node.js (for testing and tooling)

### Running Locally

1. Clone the repository.
2. Serve the directory using any static file server (e.g., `serve`, `http-server`, or VS Code Live Server).

```bash
npx serve .
```

### Testing

The project uses [Vitest](https://vitest.dev/) for unit testing core logic.

```bash
npm install
npm test
```

## Structure

- `index.html`: Main entry point.
- `css/`: Stylesheets.
- `js/`: Application modules.
  - `app.js`: Main controller.
  - `logic.js`: Core business logic (pure functions).
  - `ui.js`: DOM manipulation.
  - `firebase-config.js`: Firebase setup.
- `manifest.json`: PWA manifest.
- `sw.js`: Service Worker.

## Deployment

Deploy to any static hosting service (GitHub Pages, Vercel, Netlify, Firebase Hosting).
The app expects Firebase Realtime Database credentials in `js/firebase-config.js`.
