# Secret Hitler rules engine

The rules of Secret Hitler as pure TypeScript functions over plain data. No Firebase, no Express, no
clock and no global randomness: give it a state and an action, get the next state back.

It lives in this repo for now, but it is meant to become its own npm package, usable by any app,
platform or tool: see [#34](https://github.com/touficbatache/SecretHitlerFirebase/issues/34). The lint
rules keep it independent: code in this folder can't import Firebase, Express or the rest of the
backend, and can't use `any`.

## API

```ts
import { apply, legalActions, seededRng, setupGame, viewFor } from "./engine"

const rng = seededRng(42) // or () => Math.random()
let state = setupGame(["ann", "ben", "cat", "dan", "eva"], rng)

const result = apply(state, { type: "continue" }, rng) // the intro is over
if (result.ok) state = result.state
else console.log(result.error.code, result.error.message) // e.g. "notYourTurn"

legalActions(state) // every move allowed right now, for every player
viewFor(state, "ann") // what Ann may see: her role, her hand, never the draw pile…
```

- **`setupGame(playerIds, rng)`** deals the roles, shuffles the 17 policies and picks the first
  President. Players are in seating order.
- **`apply(state, action, rng)`** returns `{ ok: true, state }` or `{ ok: false, error }`. The given
  state is never changed. Actions say who acts (`by`), and the engine checks it's their turn.
- **`legalActions(state)`** lists every action `apply` would accept.
- **`viewFor(state, playerId)`** is what one player may know, following the rules:

  - their own role and their fellow fascists (Hitler only knows them in 5–6 player games),
  - their investigations' results, as a team, not a role,
  - the policies in their hand, and their policy peek,
  - the votes once everyone has voted.

  Other players see none of this. Pass an id that isn't a player for a spectator's view.

### Pauses

The rules don't care about time, but players need a moment to see a result: the intro, the votes, an
enacted policy, a power's outcome. During such a pause, `state.next` says what comes next and only
`{ type: "continue" }` is accepted. The server decides when to send it (5 seconds later, see
`pending-transition.ts`); a bot or a simulation can send it right away.

### Randomness and replays

All the randomness (roles, shuffles, the first President) comes from the `rng` you pass.
`seededRng(seed)` gives the same game every time, so a game can be replayed from its seed and its
list of actions.

## How the backend uses it

Every game move in `gameplay-controller.ts` goes through the engine: read the game from the database,
convert it with `engine-adapter.ts`, `apply` the action, and write back only what changed. The
database keeps its format (CSV policy lists, `status` / `subStatus`…), so the app and existing games
don't notice.

Moves arrive at `POST /action` in the engine's own format, without `by`: the server fills in the
logged-in player. Rule errors become error codes, like `WRONG_PHASE` for `wrongPhase` (see
`errors.ts`).

## Tests

`npm run test:engine` runs without the emulators:

- **Every rule:** setup, eligibility, votes, chaos, sessions, veto, each power, each way to win.
- **What each player can see.**
- **1,800 random complete games** (300 per player count) with invariants checked after every move:
  - no policy lost or duplicated,
  - a new government can always draw 3 policies,
  - a game only ends with its win condition,
  - every action from `legalActions` is accepted.
- **The database adapter** (`test/unit`): 68 game states the old controller wrote, and every state
  of 120 random games, survive the trip to the engine and back; a move only writes what changed.

## Uses beyond this app

- **Other apps and platforms:** a Discord bot, another frontend, a pass-and-play mode.
- **Training an AI to play.** Games run headless and fast. `legalActions` is the action space and
  `viewFor` is each player's observation, without information they shouldn't have. Seeds make games
  reproducible. A gym-style wrapper (`reset` / `step`) is planned in #34.

Secret Hitler is designed by Goat, Wolf & Cabbage and released under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
