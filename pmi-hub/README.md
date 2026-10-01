# DigitalTolk PMI Hub

DigitalTolk Group's project management system for post-merger integration (PMI). Each acquired
company gets its own PMI project with the workstreams that apply to it; tasks,
owners, dates and status are shared live between everyone who uses the system,
on any device, and every change is kept in a version history.

**Live app:** https://claude.ai/artifact/BtUCdHuPS92DWeYBXy59WR
(a claude.ai artifact with a shared database; share it from the page's Share menu)

## What it does

| Area | Features |
|---|---|
| Portfolio | All PMI projects with progress, Day 1 date, D+ counter, overdue/blocked counts and a RAG dot per workstream. Cross-project "needs attention" list. |
| New PMI project | Wizard: deal details (company, signing, Day 1, PMI lead, integration goals) → choose workstreams from a standard PMI playbook, copy an earlier acquisition (dates shift to the new Day 1) or start with workstreams only → review and create. |
| Overview | KPIs, workstream table with progress, computed RAG and the lead's own assessment (with comment), needs attention, next 14 days, milestones, gaps in the plan (no owner / no due date), recent changes. |
| Timeline | Gantt grouped by phase and workstream with ISO week numbers, Day 1 and today lines, milestones, drag to move or resize, and overlay of a saved plan version to show slippage. |
| Tasks / Board | Filterable list (group by workstream, phase, owner, status) with inline status and quick add; Kanban board with drag and drop. |
| Task panel | Title, status, owners, workstream, phase, start/due (working days), priority, milestone, description, Definition of Done, dependencies, comments and the task's own change history. |
| Meeting notes | Dated notes per project (meeting, attendees, workstreams, notes with bullets), grouped by ISO week, each with its own change history. Lines under "Next steps:" are treated as next week's plans. |
| Reports → Weekly update | One weekly update per project and week, in the format *What happened this week* / *Coming up next week*. Starts as a draft built from the week's meeting notes and the plan (completed, blocked, due next week); in claude.ai, *Write with Claude* turns the same sources into written bullets. The preview is edited in place (Enter adds a point, points can be moved and removed) and saved with version history. Export: copy (keeps bullets when pasted into email/Teams), Word (.docx) or Markdown. |
| Reports → Steering committee | Report built from the live plan: per workstream status, completed, overdue, blocked, coming up, escalations and milestones. Copy as text. |
| History | Change log of every change (who, when, before → after) with Restore per field; plan versions (baselines) with comparison against the current plan; trash for deleted tasks. |
| People | Directory of everyone who can be assigned tasks. Add people, import a pasted list from Excel, edit, deactivate. |
| Who are you | Click your name at the bottom of the sidebar (or *Change who you are* under My tasks) to link your account to a person, switch to another person or unlink. The link drives *My tasks* and the name on your changes. |
| Export | Excel export with the plan (same columns as the original Gantt sheet), a workstream summary and the change log. |

## Dates, navigation and branding

- **Dates are never stored as "overdue".** Overdue, due soon, the D+ counter and
  the timeline's today line are computed from each viewer's current date when the
  page renders. A clock re-renders the page every minute and when the tab comes
  back into view, so a page left open overnight rolls over to the new day.
- **Browser back/forward** move one step at a time: each page, tab, opened task
  and the new-project wizard is an entry in the browser history (`src/nav.js`).
  Closing a task or the wizard is the same as pressing back.
- **Branding** follows the DigitalTolk brandbook: Cranberry `#DE5D83`, Tawny Port
  `#81263E`, Rob Roy `#F1BF76`, black and white. Jost and Figtree are free
  stand-ins for the brand fonts Futura PT and Proxima Nova. The wordmark in
  `src/app.jsx` (`Brand`) is drawn in code; replace it with the official logo
  SVG when available.

## How data is stored

The page uses the artifact runtime's shared document database (`db`
capability), so changes are saved immediately and synced live to every open
view. The `user` capability identifies who made each change.

```
people/{id}        people who can be assigned tasks (shared by all projects)
projects/{id}      one PMI project per acquired company (phases, Day 1, lead)
workstreams/{id}   workstreams of a project (lead, order, RAG assessment)
tasks/{id}         tasks (projectId, workstreamId, phaseId, owners, dates, status …)
baselines/{id}     saved plan versions: a snapshot of every task
notes/{id}         meeting notes (projectId, date, title, attendees, workstreams, body)
reports/{id}       weekly updates, one per project and week (r_<projectId>_<monday>)
history/{entityId} version history of one task / workstream / project / person
```

Every write goes through `src/store.js`, which records the changed fields as
`{field: {from, to}}` in `history/{entityId}.events`. Events are stored in a
map keyed by a unique id, and the database merges nested objects on update, so
two people editing the same task at the same time never overwrite each other's
history entries. Deleting a task only moves it to the trash.

## Hosting

PMI Hub builds for two hosts from the same code:

| Build | Command | Sign-in | Data |
|---|---|---|---|
| GitHub Pages | `npm run build:web` → `site/` | Microsoft 365 (Firebase Authentication, single-tenant Entra app) | Cloud Firestore, protected by `firestore.rules` |
| claude.ai artifact | `npm run build` → `dist/pmi-hub.html` | claude.ai account | the artifact's shared database |

Setup of the GitHub Pages version, step by step: [docs/SETUP.md](docs/SETUP.md).
The workflow `.github/workflows/pmi-hub-pages.yml` builds and deploys on every push to
`main`; the Firebase settings come from the repository variable `PMI_FIREBASE_CONFIG`
(or `firebase.config.json`).

`src/backend/firebase.js` gives Firestore the same small API as the artifact
database, so the rest of the app does not know which host it runs on. Data
moves between the two with *Backup → Download backup / Import* (`src/backup.js`).

Database rules (`firestore.rules`):
- only accounts signed in with Microsoft and an allowed company email domain;
- the version history is append-only (entries cannot be changed or removed);
- tasks, notes and other records cannot be deleted, only moved to the trash.

Run the rules and the whole web version locally against the Firebase
emulators: `firebase emulators:start --project demo-pmi --only auth,firestore`,
then `node build.mjs --web --emulator` and serve `site/`.

## Development

```bash
npm install
npm run build   # dist/pmi-hub.html – the page published as the artifact
npm run dev     # also dist/dev.html – runs locally on an in-memory database
```

`dist/dev.html` uses `dev/mock-claude.js`, a local stand-in for the claude.ai
runtime seeded from `seed/local-seed.json` when that local file exists, so the
whole app can be opened straight from disk.

Source layout:

```
src/store.js        data layer, live subscriptions, writes and version history
src/nav.js          navigation and per-browser preferences
src/templates.js    standard PMI playbook (workstreams + tasks relative to Day 1)
src/views/          portfolio, project (overview), timeline, tasks + board,
                    status report, history, settings, people, my tasks
src/components/     task panel, new project wizard, filters, history items, UI kit
src/export.js       Excel export
src/backup.js       full backup download and import
src/backend/        claude.ai and Firebase backends (same API for the store)
src/main.jsx        entry for claude.ai; src/main-web.jsx entry for GitHub Pages
src/styles.css      design tokens (light and dark) and all styles
```

## Initial data

Company data is never stored in this repository (it is public); it lives only
in the database. To build the first data set from a PMI Gantt workbook and the
employee list, keep the files in `seed/` under git-ignored names and run:

```bash
python3 scripts/excel_to_seed.py <gantt.xlsx> seed/employees.local.txt seed/local-seed.json seed/mapping.local.json
```

Owners in the workbook are first names; each is matched to exactly one person
on the employee list. Owners that are not on the list are added as separate
people so no assignment is lost. The resulting documents are written to the
database (or loaded through *Backup → Import*).
