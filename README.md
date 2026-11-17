# Deadlock Scrims

Static Deadlock roster and multiplayer match lobby. Skill Levels follows the active lobby and syncs player names and tiers across clients.
Outside a lobby, the standalone skill roster stays local. Stats (including three
favorite heroes) and Queue remain local to each browser.
The new **Match** tab shares the actual match hero, team, player name and ready
status in Firebase Realtime Database. It uses no application server.

## Local development

From this directory (`roster/`), run `npm ci` and then `npm start`.
Open http://127.0.0.1:5173. No build step is needed. Local roster features work
without Firebase configuration; shared matches require the setup below.

## Project layout

- `dist/index.html`: app entry point and deployable static site.
- `dist/js/`: application scripts, match model, and public Firebase configuration.
- `dist/css/`: stylesheets.
- `dist/images/`: hero cards and renders used by the app.
- `tests/`: match model and database security tests.
- `firebase.json` and `database.rules.json`: hosting, emulator, and security settings.
- `.openai/hosting.json`: existing Sites identity and deployment directory.

Keep all project changes in this Git repository. Install dependencies here;
`node_modules/` and emulator logs are ignored.

## Firebase setup

1. Create a Firebase project and register a Web app. Create a Realtime Database.
2. Enable **Authentication → Sign-in method → Anonymous**. Add your GitHub Pages
   hostname (`YOUR-USER.github.io`) to Authentication's authorized domains.
3. Replace `null` in `dist/js/firebase-config.js` with your Firebase web config,
   including `apiKey`, `authDomain`, `projectId`, `appId`, and **databaseURL**.
   These are public client settings. Never include service-account keys.
4. Publish `database.rules.json` in the Realtime Database Rules editor, or run
   `npx firebase deploy --only database --project YOUR_PROJECT_ID` after logging
   into the Firebase CLI. Do this before using the app; do not use test-mode rules.
5. Serve `dist/` over HTTPS with your static host, or deploy Firebase Hosting
   with `npx firebase deploy --only hosting --project YOUR_PROJECT_ID`.
   The existing Sites hosting manifest also points to `dist/`.

## Using matches

Enter your player name and an optional lobby name (up to 60 characters) in **Match**, choose whether duplicate heroes are allowed, and
click **Create match**. Each match has 12 player slots. Copy its invite URL. Other players open that URL, enter
their names, and click **Join linked match**. The creator is the administrator and
can edit anyone's entries; other players can edit only their own. Duplicate mode
is fixed at creation. Hero changes clear ready status. Picks, team assignments,
readiness and names update automatically on all connected screens.

Anonymous Firebase accounts persist in the same browser across reloads and
reconnection. Clearing browser data, private browsing, or changing computers
creates a different identity; a shared link does not grant administrator rights.
The match remains in Firebase. Reopening the invite URL restores its state. Do
not clear the creator's browser storage if you need to retain administrator access.
Any authenticated person with the invite link can view and join that match; there
is no public match directory. Treat links as invitations, not passwords.

Offline clients display the last received state and disable editing. In-flight
writes may remain pending during an outage and complete after reconnection;
a browser close before acknowledgment can lose that pending change. A successful
save is persisted in Firebase, not only localStorage. SDK connection/auth errors
are displayed in the lobby. No presence cleanup deletes selections.

## Data and security

`matches/{pushId}` contains immutable `owner` and `allowDuplicates` settings,
`players/{authUid}` records (`slot`, `name`, `hero`, `team`, `ready`), immutable
`slots/{0..11}` ownership, and `claims/{hero}`
for unique picks. A transaction on the match updates the player and hero claims
atomically; Firebase retries concurrent edits. Rules enforce authentication,
ownership, schema, hero allowlists, immutable settings, and claim consistency,
including direct requests that bypass the UI. Slot validation prevents deletions
from bypassing child validation rules. Members cannot remove players or
matches; cleanup is an administrative Firebase Console operation. The owner is
the match administrator, not a client-supplied role flag.

Transactions and listeners follow the [Firebase web data guide](https://firebase.google.com/docs/database/web/read-and-write).
Permissions are enforced using [Realtime Database Security Rules](https://firebase.google.com/docs/database/security/index).
The browser loads the pinned Firebase SDK from Google's CDN; it requires internet
access. Firebase Auth anonymous-signup quotas and database limits apply.

## Verification

`npm install` installs development-only test tools (nothing is bundled for Pages).
Run `npm test` for transaction-model tests, and `npm run test:rules` for database
emulator tests (requires Java 21+). The latter covers concurrent picks, ownership,
schema validation and malicious writes. For browser smoke testing, serve
`dist/` with any static HTTP server after configuring a test Firebase project:

- Open two independent browser profiles, create a match in one and join in the other.
- Change hero, team and ready state; verify the other screen updates without reload.
- Race for the same hero; only one selection should succeed with duplicates disabled.
- Reload both profiles and verify selections and identity are restored.
- Disconnect/reconnect; verify controls disable offline and current state returns.
- Create another match and verify changes do not cross match IDs.
- Check that local tier editing, favorites, wins and queue still work.

The host can use the red **Boot** button to remove another player, freeing their slot and hero. Removed players can reopen the invite link and join again; booting does not ban them.

Joining players appear in **Skill Levels → Unsorted** automatically. Players can change their own name and tier; the host can change anyone’s. Tier assignments persist in the lobby and are loaded for new joiners. Booted players are removed from the shared board.

The host can use **Close match** to end a lobby for everyone. Closed matches reject further joins and edits; start a new match to play again.

Every joined player can **Leave match**, freeing their slot and hero. The host transfers to the remaining player with the lowest slot number when leaving; the last departure closes the match. Players can rejoin an open match using its invite link.

The **Account** tab saves a display name and up to three favorite heroes with priorities on this device. The saved name prefills match creation/joining and saving it updates your name in an active lobby. Account favorites are separate from the hero you select for a match.

**Skill Levels** is available only while you are a member of an open match. Leaving, being booted, or closing the match hides the tab and redirects an open skill board to Match. Live total and per-tier player counts appear in Match instead of Stats.

Match cards display the player’s Account hero roster with priorities, match wins, name, skill level, team, match hero, and ready state. Favorites are copied on creation/join and Account hero changes sync to an active match. Wins start at zero for each new match membership and can be updated by the player or host.

Use the header’s **Theme** selector for **System**, **Light**, or **Dark**. System follows device appearance by default; explicit choices persist on this device and synchronize across tabs. The light palette retains the typography, occult pattern, full tier-color count cards, and green ready states.
