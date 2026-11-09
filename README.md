# JEE Practice

An offline-ready, installable web app foundation for JEE practice sessions.

## Run locally

```sh
npm install
npm run dev
```

## Validate and build

```sh
npm run build
npm run preview
```

The production build includes a service worker and web app manifest. Completed
session summaries are stored in the browser's IndexedDB database and remain
available offline on this device. They are not synced to other devices yet.

The checked-in `syllabus.json` supplies the JEE Main 2026 Paper 1 subject,
chapter, and topic catalog. Sessions save stable subject/chapter IDs and the
exam label alongside display names. Weak-topic summaries save topic IDs and
names so analytics remain joined to the syllabus catalog.

Each stored session includes its subject, chapter, start/end timestamps,
planned duration, completion status, right/wrong/couldn't-solve counts, active
time, and weak-topic counts. Individual question numbers and attempts are not
stored. The recent-session list shows the latest five saved records.

An unfinished session is currently held in memory and will be lost if the page
is reloaded or closed before feedback is saved.
