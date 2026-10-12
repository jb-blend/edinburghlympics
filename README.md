# Edinburghlympics '26 🏆

A fully static, TV-ready Edinburgh office Olympics dashboard. No database, npm, build tools, credentials or server-side code required. Results come from plain CSV files in `data/`.

## Run locally

From the `edinburghlympics` directory:

```bash
python3 -m http.server 8000
```

Open http://localhost:8000 in a browser. **Don't open `index.html` via a `file://` URL** — browsers restrict CSV fetching from local files.

## Before launch

1. Edit `data/teams.csv`: four real `id`s, team names, mottos, and flag SVG paths. Edit/replace SVGs in `assets/` (or add your own PNGs).
2. Edit `data/competitors.csv`: one competitor per row with stable unique `id`, display `name`, matching `team_id`, and image path. Put real headshots at `assets/headshots/<competitor-id>.jpg`, or change the `headshot` column. Missing image paths automatically show initials.
3. Edit `data/events.csv`: event ID, title, ISO date (`YYYY-MM-DD`), location, status (`upcoming` or `completed`), and short description. The earliest upcoming event is featured automatically. Marco's Pool Hall is currently first.
4. Delete the **sample warm-up** event from `events.csv` and sample rows from `results.csv`, then set `demoMode: false` in `config.js`.
5. Add real rows to `data/results.csv`. **Only results attached to events marked `completed` are scored.**
6. Change the optional season, tagline and refresh cadence in `config.js`.

## Scoring CSV

```
event_id,competitor_id,position,points
pool,alex-morgan,1,10
pool,rory-campbell,2,7
pool,blair-mackenzie,3,5
```

`event_id` must match an `id` from `events.csv`; `competitor_id` must match an `id` from `competitors.csv`. `position` is informational. `points` is the number the scoreboard **adds** to individual and team totals. Set the event's status to `completed` when you want those results to count.

Scores are calculated by summing all valid points per person, then summing people per team. Equal points share a rank. You control the award scale, including ties and team events, through the CSV. Avoid duplicate result rows unless you intentionally want their points added twice.

All example names, teams, scores, flags and event dates are placeholders. The only event name supplied for the first event is Marco's Pool Hall.

## Publish: GitHub Pages

1. Create a GitHub repository, then upload **all files and directories** from this folder to the repository root.
2. In repository **Settings → Pages**, choose **Deploy from a branch**, then `main` and `/ (root)`.
3. GitHub gives you a public `https://<username>.github.io/<repo>/` URL. Load this URL in the browser on each office TV, preferably fullscreen/kiosk mode.
4. Whenever scores change, edit and commit `data/results.csv`, and (if necessary) `data/events.csv`. GitHub Pages rebuilds after each commit; connected browser tabs re-fetch CSV files every 60 seconds by default. GitHub Pages publication can still take a little while, and CDN caching may introduce a delay.

**Important:** GitHub Pages sites are public by default. Make sure competitor names/headshots are approved for external hosting. For private internal access, use an organisation-approved intranet/static-hosting option instead.

## TV tips

- Use Chrome/Edge fullscreen (F11) or your TV management tool's kiosk mode.
- Use 1920×1080 resolution if possible; the layout is responsive.
- URLs with `#overview`, `#teams`, `#individuals` deep-link to each tab. Set different TVs to different tabs if you like.
- Browser remains on the selected tab while CSV data refreshes.
- To rotate tabs automatically for passive signage, add a tab cycling feature or use your signage platform's URL rotation.

## Files

- `index.html`: page layout and tabs
- `styles.css`: visual styling
- `app.js`: CSV parsing, scoring, render, auto-refresh
- `config.js`: site configuration
- `data/*.csv`: editable input data
- `assets/*.svg`: demo flags and Edinburgh skyline graphic
- `assets/headshots/`: add your own headshots here

## Version 2 changes

### Keep your custom artwork and roster
This package is based on the starter project, **not** your edited local files. Before replacing your live site, copy your own `data/teams.csv`, `data/competitors.csv`, `data/events.csv`, `data/results.csv` and custom artwork/headshots from your existing project into this one. Do not overwrite your real edits with the included sample files. The homepage now expects **`assets/flag-tunnocks.svg`**; copy your SVG to that exact filename. It is not bundled because it was not supplied here.

### Edit wording
Change the `copy` entries in `config.js` for the main headline and subtitle on each page. For all other fixed wording (captions, labels, mottos), edit `index.html`. Team names/mottos are in `data/teams.csv`; event descriptions and dates are in `data/events.csv`.

### Enter match results
Add rows to `data/matches.csv` with this structure:

```csv
event_id,match_id,round,competitor_1_id,competitor_2_id,score_1,score_2,winner_id,notes
pool,pool-01,Round 1,alex-morgan,rory-campbell,3,1,alex-morgan,Best of five frames
pool,pool-02,Round 1,blair-mackenzie,drew-stewart,2,3,drew-stewart,Close finish
```

The example rows above are **illustrative only** and are not included as real match results. `event_id` must match `events.csv`, and both competitor IDs must match `competitors.csv`. Use an empty `winner_id` for draws or unplayed matches. `match_id` is a unique reference for each match. The results tab can show upcoming events without any matches yet. **League points are still controlled separately in `data/results.csv`**. The scores recorded in `matches.csv` never add leaderboard points themselves.

### Flags and TV
Click any team flag on the team tiles, champions panel, or rankings to open an enlarged modal. Press Escape or the × button to dismiss. Individual leaderboard portraits spin slowly (20 seconds per full rotation). Users who enable reduced motion in their OS will see static portraits. The fourth tab is at `#results` for office TV signage.
