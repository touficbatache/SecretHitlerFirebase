import { Request, Response } from "express"
import * as admin from "firebase-admin"
import { database } from "firebase-admin"

import * as constants from "./constants"
import { isSimulated } from "./dev-mode"
import { Action, apply, ApplyResult, GameState, Player, rules, setupGame, shuffle } from "./engine"
import {
  databaseUpdates,
  hasStarted,
  pendingTransition,
  toDatabase,
  toEngineState,
} from "./engine-adapter"
import { ErrorCode, sendError, sendInternalError, sendRuleError } from "./errors"
import { GameDataUpdates } from "./handlers/game-data-handler"
import { ChamberStatus, GameVisibility } from "./objects"
import { handleCreated, handleSuccess } from "./utils"

import Reference = database.Reference

export async function newGame(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = isSimulated(res) ? "randId0" : res.locals.uid
    const userName: string = isSimulated(res) ? "randName0" : res.locals.name
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

    sendError(res, "INTERNAL", "No free game code found")
    return
  } catch (err) {
    sendInternalError(res, err)
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
      sendError(res, "INVALID_REQUEST")
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
    sendInternalError(res, err)
    return
  }
}

export async function joinGame(req: Request, res: Response): Promise<void> {
  try {
    const userId: string = isSimulated(res)
      ? `randId${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
      : res.locals.uid
    const userName: string = isSimulated(res)
      ? `randName${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
      : res.locals.name
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]

    // should never be > 10 but just in case...
    if (players.length >= 10) {
      sendError(res, "GAME_FULL")
      return
    }

    if (gameData[constants.DATABASE_NODE_STATUS] === ChamberStatus[ChamberStatus.deleted]) {
      sendError(res, "GAME_NOT_FOUND")
      return
    }

    if (players.some((player: any) => player[constants.DATABASE_NODE_ID] === userId)) {
      sendError(res, "ALREADY_IN_GAME")
      return
    }

    if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
      sendError(res, "GAME_STARTED")
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
    sendInternalError(res, err)
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
    const userId: string = isSimulated(res)
      ? `randId${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}`
      : res.locals.uid
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
      sendError(res, "GAME_STARTED")
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
    sendInternalError(res, err)
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
      sendError(res, "INVALID_REQUEST")
      return
    }

    if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
      sendError(res, "GAME_STARTED")
      return
    }

    const lobbyPlayers: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
    if (lobbyPlayers.length < rules.MIN_PLAYERS) {
      sendError(res, "NOT_ENOUGH_PLAYERS")
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
    sendInternalError(res, err)
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

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** An engine action that a player makes, rather than the server. */
type PlayedAction = Exclude<Action, { type: "continue" }>

/** A move as a client sends it: an engine action without `by`, since the server knows who asks. */
export type PlayerAction = DistributiveOmit<PlayedAction, "by">

/** Client-generated, so a retry can be recognized. A UUID fits. */
const ACTION_ID: RegExp = /^[A-Za-z0-9_-]{1,64}$/

/**
 * POST /action { code, actionId?, action }: plays one move.
 *
 * `action` is an engine action without `by`, e.g. `{ type: "vote", ja: true }`. The response is
 * `{ code }`, plus what a power showed the President: `policies` for a policy peek, `membership`
 * for an investigation.
 *
 * With an `actionId`, sending the same request again is safe: once an action has succeeded, a
 * retry with its id gets the same response and changes nothing.
 */
export async function act(req: Request, res: Response): Promise<void> {
  await _act(req, res, () => parseAction(req.body.action) ?? "INVALID_REQUEST")
}

/** Validates a client's action. Returns undefined if it's malformed. */
export function parseAction(raw: unknown): PlayerAction | undefined {
  if (typeof raw !== "object" || raw === null) return undefined
  const action: Record<string, unknown> = raw as Record<string, unknown>
  switch (action.type) {
    case "nominate":
      return typeof action.chancellorId === "string"
        ? { type: "nominate", chancellorId: action.chancellorId }
        : undefined
    case "vote":
      return typeof action.ja === "boolean" ? { type: "vote", ja: action.ja } : undefined
    case "discard":
      return action.policy === "liberal" || action.policy === "fascist"
        ? { type: "discard", policy: action.policy }
        : undefined
    case "proposeVeto":
      return { type: "proposeVeto" }
    case "answerVeto":
      return typeof action.accept === "boolean"
        ? { type: "answerVeto", accept: action.accept }
        : undefined
    case "usePower":
      if (action.targetId === undefined) return { type: "usePower" }
      return typeof action.targetId === "string"
        ? { type: "usePower", targetId: action.targetId }
        : undefined
    case "endPower":
      return { type: "endPower" }
    default:
      return undefined
  }
}

/**
 * The routes from before /action, kept so that apps loaded before a deploy keep working until
 * they reload. They take the same path as /action. To remove once no app calls them.
 */
export const legacyRoutes: Record<string, (req: Request, res: Response) => Promise<void>> = {
  chooseChancellor: (req: Request, res: Response) =>
    _act(req, res, () => parseAction({ type: "nominate", chancellorId: req.body.chancellorId })),
  vote: (req: Request, res: Response) =>
    _act(req, res, () => parseAction({ type: "vote", ja: req.body.vote })),
  presidentDiscardPolicy: (req: Request, res: Response) =>
    _act(req, res, (state: GameState) =>
      state.phase.name === "presidentDiscard"
        ? parseAction({ type: "discard", policy: req.body.policy })
        : "WRONG_PHASE",
    ),
  chancellorDiscardPolicy: (req: Request, res: Response) =>
    _act(req, res, (state: GameState) =>
      state.phase.name === "chancellorDiscard"
        ? parseAction({ type: "discard", policy: req.body.policy })
        : "WRONG_PHASE",
    ),
  askForVeto: (req: Request, res: Response) => _act(req, res, () => ({ type: "proposeVeto" })),
  answerVeto: (req: Request, res: Response) =>
    _act(req, res, () =>
      typeof req.body.refuseVeto === "boolean"
        ? { type: "answerVeto", accept: !req.body.refuseVeto }
        : undefined,
    ),
  // A second call closes the policy peek or the investigation result
  presidentialPower: (req: Request, res: Response) =>
    _act(req, res, (state: GameState) =>
      state.phase.name === "power" && state.phase.used && !state.phase.done
        ? { type: "endPower" }
        : parseAction({ type: "usePower", targetId: req.body.player }),
    ),
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

interface Receipt {
  id: string
  response: Record<string, unknown>
}

/**
 * Plays one move on the request's game: checks it, applies it with the engine, saves the result
 * and responds. `makeAction` reads the request, and returns an error code if it can't.
 */
async function _act(
  req: Request,
  res: Response,
  makeAction: (state: GameState) => PlayerAction | ErrorCode | undefined,
): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const actionId: unknown = req.body.actionId
    if (actionId !== undefined && !(typeof actionId === "string" && ACTION_ID.test(actionId))) {
      sendError(res, "INVALID_REQUEST", "Invalid actionId")
      return
    }

    if (!hasStarted(gameData)) {
      sendError(res, "WRONG_PHASE", "The game hasn't started")
      return
    }
    const before: GameState = toEngineState(gameData)

    const made: PlayerAction | ErrorCode | undefined = makeAction(before)
    if (made === undefined) {
      sendError(res, "INVALID_REQUEST")
      return
    }
    if (typeof made === "string") {
      sendError(res, made as ErrorCode)
      return
    }
    const action: PlayedAction = { ...made, by: _actor(res, before, made) } as PlayedAction

    // A retry of an action that succeeded: same response, nothing changes. Checked before the
    // pause, since the action itself may have started it (the last vote, a discard...).
    const receiptPath: string = _receiptPath(gameCode, action.by)
    if (actionId !== undefined) {
      const receipt: Receipt | null = (await admin.database().ref(receiptPath).get()).val()
      if (receipt?.id === actionId) {
        handleSuccess(res, receipt.response)
        return
      }
    }

    if (gameData[constants.DATABASE_NODE_PENDING_TRANSITION] != null) {
      sendError(res, "PAUSED")
      return
    }

    const result: ApplyResult = apply(before, action, Math.random)
    if (result.error !== undefined) {
      sendRuleError(res, result.error)
      return
    }
    const after: GameState = result.state as GameState

    const response: Record<string, unknown> = { code: gameCode, ..._shown(before, after, action) }
    const receipt: Record<string, unknown> =
      actionId === undefined ? {} : { [receiptPath]: { id: actionId, response } }
    await _save(gameCode, gameData, before, after, receipt)

    handleSuccess(res, response)
  } catch (err) {
    sendInternalError(res, err)
  }
}

/** What a power showed the President: the policy peek, or the investigated player's team. */
function _shown(before: GameState, after: GameState, action: Action): Record<string, unknown> {
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
}

/** Who acts: the logged-in player, or in a simulated dev mode request, whoever's turn it is. */
function _actor(res: Response, state: GameState, action: PlayerAction): string {
  if (!isSimulated(res)) return res.locals.uid
  const session: GameState["session"] = state.session
  switch (action.type) {
    case "vote":
      return (
        state.players.find((p: Player) => p.isAlive && session?.votes[p.id] === undefined)?.id ?? ""
      )
    case "discard":
      return (
        (state.phase.name === "chancellorDiscard" ? session?.chancellorId : session?.presidentId) ??
        ""
      )
    case "proposeVeto":
      return session?.chancellorId ?? ""
    default:
      return session?.presidentId ?? ""
  }
}

/** Saves the game's changes, and any `extra` root paths, in one atomic write. */
async function _save(
  gameCode: string,
  gameData: any,
  before: GameState,
  after: GameState,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const changes: Record<string, unknown> = databaseUpdates(
    before,
    after,
    gameData[constants.DATABASE_NODE_SETTINGS],
  )
  const game: string = `${constants.DATABASE_NODE_ONGOING_GAMES}/${gameCode}`
  const updates: Record<string, unknown> = {
    ...Object.fromEntries(
      Object.entries(changes).map(([path, value]: [string, unknown]) => [`${game}/${path}`, value]),
    ),
    ...extra,
  }
  if (Object.keys(updates).length > 0) {
    await admin.database().ref().update(updates)
  }
}

function _gameRef(gameCode: string): Reference {
  return admin.database().ref().child(constants.DATABASE_NODE_ONGOING_GAMES).child(gameCode)
}

function _receiptPath(gameCode: string, playerId: string): string {
  return `${constants.DATABASE_NODE_ACTION_RECEIPTS}/${gameCode}/${playerId}`
}
