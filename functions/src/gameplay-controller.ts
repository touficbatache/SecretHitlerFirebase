import { Request, Response } from "express"
import * as admin from "firebase-admin"
import { database } from "firebase-admin"

import * as constants from "./constants"
import { isDevMode } from "./dev-mode"
import {
  Action,
  apply,
  ApplyResult,
  GameState,
  Phase,
  Player,
  Policy,
  RuleError,
  rules,
  setupGame,
  shuffle,
} from "./engine"
import {
  databaseUpdates,
  hasStarted,
  pendingTransition,
  toDatabase,
  toEngineState,
} from "./engine-adapter"
import { GameDataUpdates } from "./handlers/game-data-handler"
import { ChamberStatus, GameVisibility } from "./objects"
import {
  handleCreated,
  handleForbiddenError,
  handleGameNotFound,
  handleGameProgressTamperingError,
  handleGameStartedError,
  handleIneligiblePlayerError,
  handleInternalError,
  handleInternalErrorWithMessage,
  handleMissingFields,
  handleNotEnoughPlayersError,
  handlePlayerAlreadyInGame,
  handleSuccess,
} from "./utils"

import Reference = database.Reference

export async function newGame(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = isDevMode() ? "randId0" : res.locals.uid
    const userName: string = isDevMode() ? "randName0" : res.locals.name
    const temp: string = _randomGameCode().toString()

    let gameCreationTries: number = 1
    while (gameCreationTries <= 3) {
      const gameCodeAvailable: boolean = !(
        await admin.database().ref().child(constants.DATABASE_NODE_ONGOING_GAMES).child(temp).get()
      ).exists()
      if (gameCodeAvailable) {
        await admin
          .database()
          .ref()
          .child(constants.DATABASE_NODE_ONGOING_GAMES)
          .child(temp)
          .set({
            [constants.DATABASE_NODE_OWNER_ID]: userId,
            [constants.DATABASE_NODE_CREATED_AT]: Date.now(),
            [constants.DATABASE_NODE_PLAYERS]: [_user(userId, userName)],
            [constants.DATABASE_NODE_CONNECTED]: { [userId]: true },
            [constants.DATABASE_NODE_VISIBILITY]: GameVisibility.PRIVATE,
            [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.waiting],
            [constants.DATABASE_NODE_ELECTION_TRACKER]: 0,
          })

        handleCreated(res, { code: temp })
        return
      } else {
        gameCreationTries++
      }
    }

    handleInternalErrorWithMessage(res, "Game creation failed")
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

function _randomGameCode() {
  const digitCount: number = 6
  const min: number = 1
  const max: number = 9

  let generated: string = ""
  for (let i: number = 0; i < digitCount; i++) {
    generated += Math.floor(Math.random() * (max + 1 - min) + min).toString()
  }

  return parseInt(generated)
}

export async function setGameVisibility(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode

    const visibility: any = req.body[constants.REQUEST_VISIBILITY]

    if (
      visibility == null ||
      typeof visibility !== "string" ||
      !Object.values(GameVisibility).includes(visibility)
    ) {
      handleMissingFields(res)
      return
    }

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(
        new GameDataUpdates({
          [constants.DATABASE_NODE_VISIBILITY]: visibility as GameVisibility,
        }).updates,
      )

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

export async function joinGame(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = isDevMode()
      ? `randId${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
      : res.locals.uid
    const userName: string = isDevMode()
      ? `randName${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
      : res.locals.name
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]

    // should never be > 10 but just in case...
    if (players.length >= 10) {
      handleForbiddenError(res)
      return
    }

    if (gameData[constants.DATABASE_NODE_STATUS] === ChamberStatus[ChamberStatus.deleted]) {
      handleGameNotFound(res)
      return
    }

    if (players.some((player: any) => player[constants.DATABASE_NODE_ID] === userId)) {
      handlePlayerAlreadyInGame(res)
      return
    }

    if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
      handleGameStartedError(res)
      return
    }

    const newPlayerRef: Reference = await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .child(constants.DATABASE_NODE_PLAYERS)
      .push()
    await newPlayerRef.setWithPriority(_user(userId, userName), Date.now())

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .child(constants.DATABASE_NODE_CONNECTED)
      .child(userId)
      .set(true)

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

function _user(id: string, name: string) {
  return {
    [constants.DATABASE_NODE_ID]: id,
    [constants.DATABASE_NODE_NAME]: name,
  }
}

export async function unJoinGame(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = isDevMode()
      ? `randId${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
      : res.locals.uid
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
      handleGameStartedError(res)
      return
    }

    if (gameData[constants.DATABASE_NODE_OWNER_ID] === userId) {
      await admin
        .database()
        .ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(
          new GameDataUpdates({
            [`${constants.DATABASE_NODE_PLAYERS}.override`]: [],
            // Marked in the same write, so a join arriving during the pause is rejected.
            [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.deleted],
          }).updates,
        )
      // Clients see the empty player list from the first write and leave, then the game goes.
      // Nothing can join in between: requests on a game run one at a time.
      await admin
        .database()
        .ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .remove()
    } else {
      const playersWithoutCurrent: any[] = gameData[constants.DATABASE_NODE_PLAYERS].filter(
        (e: any) => e.id !== userId,
      )

      await admin
        .database()
        .ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(
          new GameDataUpdates({
            [constants.DATABASE_NODE_CONNECTED]: {
              [userId]: null,
            },
            [`${constants.DATABASE_NODE_PLAYERS}.override`]: playersWithoutCurrent,
          }).updates,
        )
    }

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

export async function startGame(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const hidePicsGameInfo: any = req.body[constants.REQUEST_HIDE_PICS_GAME_INFO]
    const skipLongIntro: any = req.body[constants.REQUEST_SKIP_LONG_INTRO]

    if (
      hidePicsGameInfo == null ||
      typeof hidePicsGameInfo !== "boolean" ||
      skipLongIntro == null ||
      typeof skipLongIntro !== "boolean"
    ) {
      handleMissingFields(res)
      return
    }

    if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
      handleGameStartedError(res)
      return
    }

    const lobbyPlayers: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
    if (lobbyPlayers.length < rules.MIN_PLAYERS) {
      handleNotEnoughPlayersError(res)
      return
    }

    // Deals the roles and the policies, and picks the first President
    const state: GameState = setupGame(
      lobbyPlayers.map((player: any) => player[constants.DATABASE_NODE_ID]),
      Math.random,
    )
    const stored: Record<string, any> = toDatabase(state)
    const pictures: string[] = _pictures(state.players)
    const now: number = Date.now()
    const settings: { skipLongIntro: boolean } = { skipLongIntro }

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update({
        [constants.DATABASE_NODE_PLAYERS]: lobbyPlayers.map((player: any, i: number) => ({
          ...player,
          [constants.DATABASE_NODE_ROLE]: state.players[i].role,
          [constants.DATABASE_NODE_ASSET_REFERENCE]: pictures[i],
        })),
        [constants.DATABASE_NODE_GAME_TYPE]: _gameType(lobbyPlayers.length),
        [constants.DATABASE_NODE_EXECUTIVE_ACTIONS]:
          stored[constants.DATABASE_NODE_EXECUTIVE_ACTIONS],
        [constants.DATABASE_NODE_CHAMBER_POLICIES]:
          stored[constants.DATABASE_NODE_CHAMBER_POLICIES],
        [constants.DATABASE_NODE_SETTINGS]: {
          [constants.DATABASE_NODE_HIDE_PICS_GAME_INFO]: hidePicsGameInfo,
          [constants.DATABASE_NODE_SKIP_LONG_INTRO]: skipLongIntro,
        },
        [constants.DATABASE_NODE_STATUS]: stored[constants.DATABASE_NODE_STATUS],
        [constants.DATABASE_NODE_CURRENT_SESSION]: {
          [constants.DATABASE_NODE_PRESIDENT_ID]: state.rotationPresidentId,
        },
        [constants.DATABASE_NODE_LAST_PRESIDENT_ID]: state.rotationPresidentId,
        [constants.DATABASE_NODE_STARTED_AT]: now,
        // The intro plays on every screen, then the first President chooses a Chancellor
        [constants.DATABASE_NODE_PENDING_TRANSITION]: pendingTransition(state, settings, now),
      })

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

function _gameType(playerCount: number): string {
  return playerCount <= 6 ? "fiveSix" : playerCount <= 8 ? "sevenEight" : "nineTen"
}

/** Each player's picture: Hitler's own, and a shuffled one of their team's. */
function _pictures(players: Player[]): string[] {
  const fascists: string[] = shuffle(
    ["fascist_frog", "fascist_lizard", "fascist_snake"],
    Math.random,
  )
  const liberals: string[] = shuffle(
    ["liberal_1", "liberal_2", "liberal_3", "liberal_4", "liberal_5", "liberal_6"],
    Math.random,
  )
  return players.map((player: Player) =>
    player.role === "hitler"
      ? "hitler"
      : player.role === "fascist"
      ? (fascists.pop() as string)
      : (liberals.pop() as string),
  )
}

/**
 * The gameplay endpoints below only turn requests into rules engine actions: the engine decides
 * whether an action is allowed and what it changes (see engine/README.md).
 */

export async function chooseChancellor(req: Request, res: Response): Promise<void> {
  const chancellorId: unknown = req.body[constants.REQUEST_CHANCELLOR_ID]
  if (typeof chancellorId !== "string") {
    handleMissingFields(res)
    return
  }
  await _play(res, (state: GameState) => ({
    type: "nominate",
    by: _actor(res, state, "president"),
    chancellorId,
  }))
}

export async function vote(req: Request, res: Response): Promise<void> {
  const ja: unknown = req.body[constants.REQUEST_VOTE]
  if (typeof ja !== "boolean") {
    handleMissingFields(res)
    return
  }
  await _play(res, (state: GameState) => ({
    type: "vote",
    // Dev mode: each vote is the next fake player's
    by: isDevMode() ? `randId${Object.keys(state.session?.votes ?? {}).length}` : res.locals.uid,
    ja,
  }))
}

export async function presidentDiscardPolicy(req: Request, res: Response): Promise<void> {
  const policy: unknown = req.body[constants.REQUEST_POLICY]
  if (typeof policy !== "string") {
    handleMissingFields(res)
    return
  }
  await _play(
    res,
    (state: GameState) => ({
      type: "discard",
      by: _actor(res, state, "president"),
      policy: policy as Policy,
    }),
    { phase: "presidentDiscard" },
  )
}

export async function chancellorDiscardPolicy(req: Request, res: Response): Promise<void> {
  const policy: unknown = req.body[constants.REQUEST_POLICY]
  if (typeof policy !== "string") {
    handleMissingFields(res)
    return
  }
  await _play(
    res,
    (state: GameState) => ({
      type: "discard",
      by: _actor(res, state, "chancellor"),
      policy: policy as Policy,
    }),
    { phase: "chancellorDiscard" },
  )
}

export async function askForVeto(req: Request, res: Response): Promise<void> {
  await _play(res, (state: GameState) => ({
    type: "proposeVeto",
    by: _actor(res, state, "chancellor"),
  }))
}

export async function answerVeto(req: Request, res: Response): Promise<void> {
  const refuseVeto: unknown = req.body[constants.REQUEST_REFUSE_VETO]
  if (typeof refuseVeto !== "boolean") {
    handleMissingFields(res)
    return
  }
  await _play(res, (state: GameState) => ({
    type: "answerVeto",
    by: _actor(res, state, "president"),
    accept: !refuseVeto,
  }))
}

/**
 * Uses the current presidential power. For the policy peek and the investigation, a second call
 * closes the result and moves the game on.
 */
export async function presidentialPower(req: Request, res: Response): Promise<void> {
  const target: unknown = req.body[constants.REQUEST_PLAYER]
  await _play(
    res,
    (state: GameState) => {
      const by: string = _actor(res, state, "president")
      const phase: Phase = state.phase
      if (phase.name === "power" && phase.used && !phase.done) return { type: "endPower", by }
      if (phase.name === "power" && phase.power !== "policyPeek" && typeof target !== "string") {
        return MISSING_FIELDS
      }
      return { type: "usePower", by, targetId: typeof target === "string" ? target : undefined }
    },
    {
      response: (before: GameState, after: GameState, action: Action) => {
        if (action.type !== "usePower" || before.phase.name !== "power") return {}
        if (before.phase.power === "policyPeek") {
          return { policies: (after.session?.peekedPolicies ?? []).join(",") }
        }
        if (before.phase.power === "investigateLoyalty") {
          const investigated: Player | undefined = after.players.find(
            (p: Player) => p.id === action.targetId,
          )
          return { membership: rules.teamOf(investigated?.role ?? "liberal") }
        }
        return {}
      },
    },
  )
}

/**
 * Applies the game's pending transition if its pause is over. Must run while holding the game's
 * lock. Returns whether the game changed.
 */
export async function runDueTransitions(gameCode: string, gameData: any): Promise<boolean> {
  const pending: any = gameData?.[constants.DATABASE_NODE_PENDING_TRANSITION]
  if (pending == null || !(pending.at <= Date.now()) || !hasStarted(gameData)) return false

  const before: GameState = toEngineState(gameData)
  const result: ApplyResult = apply(before, { type: "continue" }, Math.random)
  if (result.error !== undefined) {
    // An unknown or impossible transition: drop it rather than retry it on every request
    console.error(`Transition ${pending.kind} of game ${gameCode} failed:`, result.error.message)
    await _gameRef(gameCode).child(constants.DATABASE_NODE_PENDING_TRANSITION).remove()
    return true
  }
  await _save(gameCode, gameData, before, result.state as GameState)
  return true
}

/**
 * Lets a client move the game on once a pause is over: due transitions are applied before any
 * request reaches this handler (see pendingTransitionHandler). Responds with the time of the
 * transition still pending, if any, so a client whose clock ran ahead can try again then.
 */
export async function advance(req: Request, res: Response): Promise<void> {
  const pending: any = res.locals.gameData[constants.DATABASE_NODE_PENDING_TRANSITION]
  handleSuccess(res, {
    code: res.locals.gameCode,
    ...(pending != null ? { pendingTransitionAt: pending.at } : {}),
  })
}

const MISSING_FIELDS: unique symbol = Symbol("missing fields")

interface PlayOptions {
  /** The phase this endpoint is for: other phases get a 457 without asking the engine. */
  phase?: Phase["name"]
  /** Extra response data, such as what a policy peek showed. */
  response?: (before: GameState, after: GameState, action: Action) => Record<string, unknown>
}

/** Runs one engine action on the request's game, saves the result and responds. */
async function _play(
  res: Response,
  makeAction: (state: GameState) => Action | typeof MISSING_FIELDS,
  options: PlayOptions = {},
): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    if (!hasStarted(gameData)) {
      handleGameProgressTamperingError(res)
      return
    }
    const before: GameState = toEngineState(gameData)
    if (options.phase !== undefined && before.phase.name !== options.phase) {
      handleGameProgressTamperingError(res)
      return
    }

    const action: Action | typeof MISSING_FIELDS = makeAction(before)
    if (action === MISSING_FIELDS) {
      handleMissingFields(res)
      return
    }

    const result: ApplyResult = apply(before, action, Math.random)
    if (result.error !== undefined) {
      _sendRuleError(res, result.error)
      return
    }
    const after: GameState = result.state as GameState
    await _save(gameCode, gameData, before, after)

    handleSuccess(res, { code: gameCode, ...options.response?.(before, after, action) })
  } catch (err) {
    handleInternalError(res, err)
  }
}

/** Who acts. In dev mode, any request acts as whoever's turn it is. */
function _actor(res: Response, state: GameState, role: "president" | "chancellor"): string {
  if (!isDevMode()) return res.locals.uid
  return (role === "president" ? state.session?.presidentId : state.session?.chancellorId) ?? ""
}

/** The same statuses as before the engine: 458 for a player who can't be chosen, else 457. */
function _sendRuleError(res: Response, error: RuleError): void {
  if (error.code === "ineligible") {
    handleIneligiblePlayerError(res)
  } else {
    handleGameProgressTamperingError(res)
  }
}

async function _save(
  gameCode: string,
  gameData: any,
  before: GameState,
  after: GameState,
): Promise<void> {
  const updates: Record<string, unknown> = databaseUpdates(
    before,
    after,
    gameData[constants.DATABASE_NODE_SETTINGS],
  )
  if (Object.keys(updates).length > 0) {
    await _gameRef(gameCode).update(updates)
  }
}

function _gameRef(gameCode: string): Reference {
  return admin.database().ref().child(constants.DATABASE_NODE_ONGOING_GAMES).child(gameCode)
}
