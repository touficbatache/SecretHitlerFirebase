import { Request, Response } from "express"
import * as admin from "firebase-admin"
import { database } from "firebase-admin"
import { ServerValue } from "firebase-admin/database"

import * as constants from "./constants"
import { isDevMode } from "./dev-mode"
import { DiscardPile, reshuffledDrawPile } from "./draw-pile"
import { findPlayer, isEligibleForChancellor, isValidPowerTarget } from "./eligibility"
import { GameDataUpdates, getGameData } from "./handlers/game-data-handler"
import {
  AssetReference,
  ChamberStatus,
  ChamberSubStatus,
  ExecutiveAction,
  GameType,
  GameVisibility,
  PlayerGeneratedRoleHolder,
  PlayerMembership,
  PlayerRole,
  Policy,
  PresidentialPower,
} from "./objects"
import {
  isDue,
  LONG_INTRO_MS,
  PendingTransition,
  pendingTransition,
  RESULT_PAUSE_MS,
  scheduleTransition,
  SHORT_INTRO_MS,
  TransitionKind,
} from "./pending-transition"
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
  handleUnexpectedInternalError,
  shuffle,
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

    const playerCount: number = gameData[constants.DATABASE_NODE_PLAYERS].length
    if (playerCount < 5) {
      handleNotEnoughPlayersError(res)
      return
    }
    let liberals: number = 0
    let fascists: number = 0
    let gameType: GameType = GameType.fiveSix
    switch (playerCount) {
      case 5:
        liberals = 3
        fascists = 1
        gameType = GameType.fiveSix
        break
      case 6:
        liberals = 4
        fascists = 1
        gameType = GameType.fiveSix
        break
      case 7:
        liberals = 4
        fascists = 2
        gameType = GameType.sevenEight
        break
      case 8:
        liberals = 5
        fascists = 2
        gameType = GameType.sevenEight
        break
      case 9:
        liberals = 5
        fascists = 3
        gameType = GameType.nineTen
        break
      case 10:
        liberals = 6
        fascists = 3
        gameType = GameType.nineTen
        break
    }

    const profileImagesFascist: AssetReference[] = [
      AssetReference.fascist_frog,
      AssetReference.fascist_lizard,
      AssetReference.fascist_snake,
    ]
    shuffle(profileImagesFascist)
    const profileImagesLiberal: AssetReference[] = [
      AssetReference.liberal_1,
      AssetReference.liberal_2,
      AssetReference.liberal_3,
      AssetReference.liberal_4,
      AssetReference.liberal_5,
      AssetReference.liberal_6,
    ]
    shuffle(profileImagesLiberal)

    const roles: PlayerGeneratedRoleHolder[] = [
      new PlayerGeneratedRoleHolder(PlayerRole.hitler, AssetReference.hitler),
    ]
    for (let i: number = 0; i < liberals; i++) {
      roles.push(new PlayerGeneratedRoleHolder(PlayerRole.liberal, profileImagesLiberal[i]))
    }
    for (let i: number = 0; i < fascists; i++) {
      roles.push(new PlayerGeneratedRoleHolder(PlayerRole.fascist, profileImagesFascist[i]))
    }
    shuffle(roles)

    const playersWithRoles: any[] = gameData[constants.DATABASE_NODE_PLAYERS].map(
      (e: any, index: number) => _player(e, roles[index]),
    )

    const presidentPlayerId: string = _randomPresidentPlayerId(
      gameData[constants.DATABASE_NODE_PLAYERS],
    )

    // The intro plays on every screen, then the first President chooses a Chancellor
    const introMs: number = skipLongIntro ? SHORT_INTRO_MS : LONG_INTRO_MS
    const introTransition: PendingTransition = pendingTransition(
      TransitionKind.finishSetup,
      introMs,
    )

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(
        new GameDataUpdates({
          [`${constants.DATABASE_NODE_PLAYERS}.override`]: playersWithRoles,
          [constants.DATABASE_NODE_GAME_TYPE]: GameType[gameType],
          [constants.DATABASE_NODE_EXECUTIVE_ACTIONS]: _executiveActions(gameType),
          [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
            [constants.DATABASE_NODE_DRAW_PILE]: _generateDrawPile(),
          },
          [constants.DATABASE_NODE_SETTINGS]: {
            [constants.DATABASE_NODE_HIDE_PICS_GAME_INFO]: hidePicsGameInfo,
            [constants.DATABASE_NODE_SKIP_LONG_INTRO]: skipLongIntro,
          },
          [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.settingUp],
          [constants.DATABASE_NODE_CURRENT_SESSION]: {
            [constants.DATABASE_NODE_PRESIDENT_ID]: presidentPlayerId,
          },
          [constants.DATABASE_NODE_LAST_PRESIDENT_ID]: presidentPlayerId,
          [constants.DATABASE_NODE_STARTED_AT]: introTransition.at - introMs,
          [`${constants.DATABASE_NODE_PENDING_TRANSITION}.override`]: introTransition,
        }).updates,
      )

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

function _generateDrawPile(liberal: number = 6, fascist: number = 11) {
  const policies: string[] = []
  for (let i: number = 0; i < liberal; i++) {
    policies.push(Policy.LIBERAL)
  }
  for (let i: number = 0; i < fascist; i++) {
    policies.push(Policy.FASCIST)
  }
  shuffle(policies)
  return policies
}

function _player(player: any, roleHolder: PlayerGeneratedRoleHolder) {
  player[constants.DATABASE_NODE_ROLE] = PlayerRole[roleHolder.role]
  player[constants.DATABASE_NODE_ASSET_REFERENCE] = AssetReference[roleHolder.assetReference]
  return player
}

function _executiveActions(gameType?: GameType) {
  switch (gameType) {
    case GameType.fiveSix:
      return {
        "3": ExecutiveAction.POLICY_PEEK,
        "4": ExecutiveAction.EXECUTION,
        "5": ExecutiveAction.EXECUTION,
      }
    case GameType.sevenEight:
      return {
        "2": ExecutiveAction.INVESTIGATE_LOYALTY,
        "3": ExecutiveAction.CALL_SPECIAL_ELECTION,
        "4": ExecutiveAction.EXECUTION,
        "5": ExecutiveAction.EXECUTION,
      }
    case GameType.nineTen:
      return {
        "1": ExecutiveAction.INVESTIGATE_LOYALTY,
        "2": ExecutiveAction.INVESTIGATE_LOYALTY,
        "3": ExecutiveAction.CALL_SPECIAL_ELECTION,
        "4": ExecutiveAction.EXECUTION,
        "5": ExecutiveAction.EXECUTION,
      }
    default:
      return null
  }
}

function _randomPresidentPlayerId(players: any[]) {
  const index: number = Math.floor(Math.random() * players.length)
  return players[index][constants.DATABASE_NODE_ID]
}

async function _finishSetup(gameCode: string) {
  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(
      new GameDataUpdates({
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.election],
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[ChamberSubStatus.election_presidentChoosingChancellor],
        [constants.DATABASE_NODE_PENDING_TRANSITION]: null,
      }).updates,
    )
}

export async function chooseChancellor(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const chancellorId: any = req.body[constants.REQUEST_CHANCELLOR_ID]

    if (chancellorId == null || typeof chancellorId !== "string") {
      handleMissingFields(res)
      return
    }

    if (
      gameData[constants.DATABASE_NODE_SUB_STATUS] !==
        ChamberSubStatus[ChamberSubStatus.election_presidentChoosingChancellor] ||
      gameData[constants.DATABASE_NODE_CURRENT_SESSION]?.[constants.DATABASE_NODE_CHANCELLOR_ID] !=
        null
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    if (
      !isEligibleForChancellor({
        players: gameData[constants.DATABASE_NODE_PLAYERS],
        candidateId: chancellorId,
        presidentId:
          gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID],
        lastElectedPresidentId: gameData[constants.DATABASE_NODE_LAST_SUCCESSFUL_PRESIDENT_ID],
        lastElectedChancellorId: gameData[constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID],
      })
    ) {
      handleIneligiblePlayerError(res)
      return
    }

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(
        new GameDataUpdates({
          [constants.DATABASE_NODE_CURRENT_SESSION]: {
            [constants.DATABASE_NODE_CHANCELLOR_ID]: chancellorId,
          },
          [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.election],
          [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.election_voting],
        }).updates,
      )

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

export async function vote(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const vote: any = req.body[constants.REQUEST_VOTE]

    if (vote == null || typeof vote !== "boolean") {
      handleMissingFields(res)
      return
    }

    if (
      gameData[constants.DATABASE_NODE_CURRENT_SESSION] == null ||
      gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID] ==
        null ||
      gameData[constants.DATABASE_NODE_SUB_STATUS] !=
        ChamberSubStatus[ChamberSubStatus.election_voting]
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    const userId: string = isDevMode()
      ? `randId${
          Object.values(
            gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES] ?? {},
          ).length
        }`
      : res.locals.uid

    if (
      (gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES] != null &&
        gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES][userId] !=
          null) ||
      (gameData[constants.DATABASE_NODE_PLAYERS] as any[]).find(
        (player: any) => player[constants.DATABASE_NODE_ID] === userId,
      )[constants.DATABASE_NODE_IS_EXECUTED] === true
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    const gameDataUpdates: GameDataUpdates = new GameDataUpdates()

    gameDataUpdates.push({
      [constants.DATABASE_NODE_CURRENT_SESSION]: {
        [constants.DATABASE_NODE_VOTES]: {
          [userId]: vote,
        },
      },
    })

    const alivePlayersCount: number = (gameData[constants.DATABASE_NODE_PLAYERS] as any[]).filter(
      (player: any) => !player[constants.DATABASE_NODE_IS_EXECUTED],
    ).length
    const upcomingVoteCount: number =
      Object.values(
        gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES] ?? [],
      ).length + 1
    const hasVoteEnded: boolean = alivePlayersCount === upcomingVoteCount
    let hasSucceeded: boolean = false

    if (hasVoteEnded) {
      gameDataUpdates.push({
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[ChamberSubStatus.election_votingEnded],
      })

      const yaCount: number =
        Object.values<boolean>(
          gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES],
        ).filter((element: boolean) => element).length + (vote ? 1 : 0)
      hasSucceeded = yaCount > alivePlayersCount / 2.0
      gameDataUpdates.push({
        [constants.DATABASE_NODE_CURRENT_SESSION]: {
          [constants.DATABASE_NODE_HAS_SUCCEEDED]: hasSucceeded,
        },
      })

      // Everyone sees the votes, then the game moves on
      const isThirdFailure: boolean =
        !hasSucceeded && gameData[constants.DATABASE_NODE_ELECTION_TRACKER] + 1 == 3
      const next: TransitionKind = hasSucceeded
        ? TransitionKind.beginLegislativeSession
        : isThirdFailure
        ? TransitionKind.frustratedPopulace
        : TransitionKind.nextElection
      gameDataUpdates.push({
        [`${constants.DATABASE_NODE_PENDING_TRANSITION}.override`]: pendingTransition(
          next,
          RESULT_PAUSE_MS,
        ),
      })
      if (hasSucceeded) {
        // The election tracker is not reset here: per the rules it resets when a policy is
        // enacted, so a vetoed government still advances it (see answerVeto).
        gameDataUpdates.push({
          [constants.DATABASE_NODE_LAST_SUCCESSFUL_PRESIDENT_ID]:
            gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID],
          [constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID]:
            gameData[constants.DATABASE_NODE_CURRENT_SESSION][
              constants.DATABASE_NODE_CHANCELLOR_ID
            ],
        })
      } else {
        gameDataUpdates.push({
          [constants.DATABASE_NODE_ELECTION_TRACKER]: ServerValue.increment(1),
        })
      }
    }

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(gameDataUpdates.updates)

    if (hasVoteEnded && hasSucceeded) {
      // End game if 3+ fascist policies are enacted and hitler is chancellor
      await _tryEndGameAfterGovernmentElection(gameCode)
    }

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

async function _enactPolicyByFrustratedPopulace(gameCode: string) {
  // The pile should already hold 3+ policies; this only guards against an empty pile.
  await _prepareDrawPile(gameCode)

  const gameData: any = await getGameData(gameCode)
  const gameDataUpdates: GameDataUpdates = new GameDataUpdates()

  const firstPolicy: Policy =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE][0]
  if (firstPolicy == null) {
    // TODO: make sure error is logged
    console.error(`500 - Unexpected error`)
    return
  }

  // Chaos resets the tracker and makes everyone eligible again (term limits are forgotten).
  gameDataUpdates.push({ [constants.DATABASE_NODE_PENDING_TRANSITION]: null })
  gameDataUpdates.push({ [constants.DATABASE_NODE_ELECTION_TRACKER]: 0 })
  gameDataUpdates.push({ [constants.DATABASE_NODE_LAST_SUCCESSFUL_PRESIDENT_ID]: null })
  gameDataUpdates.push({ [constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID]: null })

  gameDataUpdates.push({
    [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
      [constants.DATABASE_NODE_DRAW_PILE]:
        gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE].slice(
          1,
        ),
    },
  })

  const firstPolicyPileNode: string =
    firstPolicy == Policy.LIBERAL
      ? constants.DATABASE_NODE_LIBERAL
      : constants.DATABASE_NODE_FASCIST
  gameDataUpdates.push({
    [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
      [constants.DATABASE_NODE_BOARD]: {
        [firstPolicyPileNode]: ServerValue.increment(1),
      },
    },
  })

  // History order: the government that caused the chaos first, then the chaos enactment.
  // _nextElection is told not to archive the current session again.
  const sessionCount: number = (gameData[constants.DATABASE_NODE_SESSIONS] ?? []).length
  gameDataUpdates.push({
    [constants.DATABASE_NODE_SESSIONS]: {
      [sessionCount]: gameData[constants.DATABASE_NODE_CURRENT_SESSION],
      [sessionCount + 1]: {
        [constants.DATABASE_NODE_PRESIDENT_ID]: null,
        [constants.DATABASE_NODE_CHANCELLOR_ID]: null,
        [constants.DATABASE_NODE_VOTES]: null,
        [constants.DATABASE_NODE_IS_SPECIAL_ELECTION]: false,
        [constants.DATABASE_NODE_HAS_SUCCEEDED]: false,
        [constants.DATABASE_NODE_ENACTED_POLICY]: firstPolicyPileNode,
        [constants.DATABASE_NODE_ENACTMENT_BY_FRUSTRATED_POPULACE]: true,
      },
    },
  })

  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(gameDataUpdates.updates)

  // Taking the top policy can leave fewer than 3 in the pile.
  await _prepareDrawPile(gameCode)

  // End game if:
  // - 5 liberal policies are enacted
  // - 6 fascist policies are enacted
  const hasGameEnded: boolean = await _tryEndGameWithBoardCount(gameCode)
  if (!hasGameEnded) {
    await _startNextElection(gameCode, undefined, false)
  }
}

/** Ends the government's turn: after a pause, the next President chooses a Chancellor. */
async function _nextElection(gameCode: string, specialElectionPresidentId?: string) {
  await scheduleTransition(
    gameCode,
    pendingTransition(TransitionKind.nextElection, RESULT_PAUSE_MS, specialElectionPresidentId),
  )
}

async function _startNextElection(
  gameCode: string,
  specialElectionPresidentId: string | undefined = undefined,
  archiveCurrentSession: boolean = true,
) {
  const gameData: any = await getGameData(gameCode)

  const sessionCount: number = (gameData[constants.DATABASE_NODE_SESSIONS] ?? []).length
  const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
  const lastPresidentIndex: number = players.findIndex(
    (player: any) =>
      player[constants.DATABASE_NODE_ID] == gameData[constants.DATABASE_NODE_LAST_PRESIDENT_ID],
  )
  const nextPresidentId: string =
    specialElectionPresidentId ?? _nextPresidentId(players, lastPresidentIndex)

  const gameDataUpdates: GameDataUpdates = new GameDataUpdates({
    [`${constants.DATABASE_NODE_CURRENT_SESSION}.override`]: {
      [constants.DATABASE_NODE_PRESIDENT_ID]: nextPresidentId,
      [constants.DATABASE_NODE_IS_SPECIAL_ELECTION]: specialElectionPresidentId !== undefined,
    },
    [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: null,
    [constants.DATABASE_NODE_SPECIAL_ELECTION_PLAYER]: null,
    [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.election],
    [constants.DATABASE_NODE_SUB_STATUS]:
      ChamberSubStatus[ChamberSubStatus.election_presidentChoosingChancellor],
    [constants.DATABASE_NODE_PENDING_TRANSITION]: null,
  })

  if (archiveCurrentSession) {
    gameDataUpdates.push({
      [constants.DATABASE_NODE_SESSIONS]: {
        [sessionCount]: gameData[constants.DATABASE_NODE_CURRENT_SESSION],
      },
    })
  }

  if (specialElectionPresidentId === undefined) {
    gameDataUpdates.push({ [constants.DATABASE_NODE_LAST_PRESIDENT_ID]: nextPresidentId })
  }

  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(gameDataUpdates.updates)
}

function _nextPresidentId(players: any[], lastPresidentIndex: number): string {
  const nextPresidentIndex: number =
    lastPresidentIndex == players.length - 1 ? 0 : lastPresidentIndex + 1
  if (players[nextPresidentIndex][constants.DATABASE_NODE_IS_EXECUTED]) {
    return _nextPresidentId(players, nextPresidentIndex)
  }
  return players[nextPresidentIndex][constants.DATABASE_NODE_ID]
}

async function _beginLegislativeSession(gameCode: string) {
  // The pile is reshuffled at the end of each session, so this is only a safety net.
  await _prepareDrawPile(gameCode)

  const gameData: any = await getGameData(gameCode)

  const topPolicies: string[] =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE]
  const otherPolicies: string[] = topPolicies.splice(3)

  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(
      new GameDataUpdates({
        [constants.DATABASE_NODE_CURRENT_SESSION]: {
          [constants.DATABASE_NODE_PRESIDENT_POLICIES]: topPolicies,
        },
        [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
          [constants.DATABASE_NODE_DRAW_PILE]: otherPolicies,
        },
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[ChamberSubStatus.legislativeSession_presidentDiscardingPolicy],
        [constants.DATABASE_NODE_PENDING_TRANSITION]: null,
      }).updates,
    )
}

/**
 * Reshuffles the draw pile with the discard pile when fewer than 3 policies remain.
 * Call it at the end of every legislative session and after a chaos enactment.
 */
async function _prepareDrawPile(gameCode: string) {
  const gameData: any = await getGameData(gameCode)

  const drawPile: string[] =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES]?.[constants.DATABASE_NODE_DRAW_PILE] ?? []
  const discardPile: DiscardPile | undefined =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES]?.[constants.DATABASE_NODE_DISCARD_PILE]

  const newDrawPile: string[] | undefined = reshuffledDrawPile(drawPile, discardPile)
  if (newDrawPile === undefined) {
    return
  }

  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(
      new GameDataUpdates({
        [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
          [constants.DATABASE_NODE_DRAW_PILE]: newDrawPile,
          [constants.DATABASE_NODE_DISCARD_PILE]: null,
        },
      }).updates,
    )
}

export async function presidentDiscardPolicy(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const discardedPolicy: any = req.body[constants.REQUEST_POLICY]

    if (discardedPolicy == null || typeof discardedPolicy !== "string") {
      handleMissingFields(res)
      return
    }

    // Empty when there's no current session (game not started or ended): the phase check
    // below then rejects the request.
    const presidentPolicies: string[] =
      gameData[constants.DATABASE_NODE_CURRENT_SESSION]?.[
        constants.DATABASE_NODE_PRESIDENT_POLICIES
      ] ?? []

    if (
      gameData[constants.DATABASE_NODE_SUB_STATUS] !=
        ChamberSubStatus[ChamberSubStatus.legislativeSession_presidentDiscardingPolicy] ||
      presidentPolicies.length !== 3 ||
      !presidentPolicies.includes(discardedPolicy)
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    presidentPolicies.splice(presidentPolicies.indexOf(discardedPolicy), 1)

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(
        new GameDataUpdates({
          [constants.DATABASE_NODE_CURRENT_SESSION]: {
            [constants.DATABASE_NODE_CHANCELLOR_POLICIES]: presidentPolicies,
          },
          [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
            [constants.DATABASE_NODE_DISCARD_PILE]: {
              [discardedPolicy]: ServerValue.increment(1),
            },
          },
          [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
          [constants.DATABASE_NODE_SUB_STATUS]:
            ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy],
        }).updates,
      )

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

export async function chancellorDiscardPolicy(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    const discardedPolicy: any = req.body[constants.REQUEST_POLICY]

    if (discardedPolicy == null || typeof discardedPolicy !== "string") {
      handleMissingFields(res)
      return
    }

    // Empty when there's no current session (game not started or ended): the phase check
    // below then rejects the request.
    const chancellorPolicies: string[] =
      gameData[constants.DATABASE_NODE_CURRENT_SESSION]?.[
        constants.DATABASE_NODE_CHANCELLOR_POLICIES
      ] ?? []

    if (
      gameData[constants.DATABASE_NODE_SUB_STATUS] !=
        ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy] ||
      chancellorPolicies.length !== 2 ||
      !chancellorPolicies.includes(discardedPolicy)
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    chancellorPolicies.splice(chancellorPolicies.indexOf(discardedPolicy), 1)

    const boardPolicy: string = chancellorPolicies[0]

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(
        new GameDataUpdates({
          [constants.DATABASE_NODE_CURRENT_SESSION]: {
            [constants.DATABASE_NODE_ENACTED_POLICY]: boardPolicy,
          },
          [constants.DATABASE_NODE_ELECTION_TRACKER]: 0,
          [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
            [constants.DATABASE_NODE_DISCARD_PILE]: {
              [discardedPolicy]: ServerValue.increment(1),
            },
            [constants.DATABASE_NODE_BOARD]: {
              [boardPolicy]: ServerValue.increment(1),
            },
          },
          [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
          [constants.DATABASE_NODE_SUB_STATUS]:
            ChamberSubStatus[ChamberSubStatus.legislativeSession_sessionEndedWithPolicyEnactment],
        }).updates,
      )

    await _onEnactPolicy(gameCode, boardPolicy)

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

async function _onEnactPolicy(gameCode: string, enactedPolicy: string) {
  // End of the legislative session: reshuffle now, after both discards, so that a
  // policy peek right after this enactment always sees 3 policies.
  await _prepareDrawPile(gameCode)

  const gameData: any = await getGameData(gameCode)

  const policy: Policy = enactedPolicy
  if (enactedPolicy == null) {
    // TODO: make sure error is logged
    console.error(`500 - Unexpected error`)
    return
  }

  if (policy == Policy.FASCIST) {
    const index: number =
      gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][
        constants.DATABASE_NODE_FASCIST
      ]
    if (
      Object.prototype.hasOwnProperty.call(
        gameData[constants.DATABASE_NODE_EXECUTIVE_ACTIONS],
        index,
      )
    ) {
      const presidentialPower: ExecutiveAction =
        gameData[constants.DATABASE_NODE_EXECUTIVE_ACTIONS][index]
      const subStatus: ChamberSubStatus | undefined = (function (): ChamberSubStatus | undefined {
        switch (presidentialPower) {
          case ExecutiveAction.POLICY_PEEK:
            return ChamberSubStatus.presidentialPower_policyPeek
          case ExecutiveAction.INVESTIGATE_LOYALTY:
            return ChamberSubStatus.presidentialPower_investigateLoyalty
          case ExecutiveAction.CALL_SPECIAL_ELECTION:
            return ChamberSubStatus.presidentialPower_callSpecialElection
          case ExecutiveAction.EXECUTION:
            return ChamberSubStatus.presidentialPower_execution
          default:
            return undefined
        }
      })()

      if (subStatus === undefined) {
        // TODO: make sure error is logged
        console.error(`500 - Unexpected error`)
        return
      }

      await admin
        .database()
        .ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(
          new GameDataUpdates({
            [constants.DATABASE_NODE_CURRENT_SESSION]: {
              [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: ChamberSubStatus[subStatus],
            },
            [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.presidentialPower],
            [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[subStatus],
          }).updates,
        )

      return
    }
  }

  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(
      new GameDataUpdates({
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[ChamberSubStatus.legislativeSession_sessionEndedWithPolicyEnactment],
      }).updates,
    )

  // End game if:
  // - 5 liberal policies are enacted
  // - 6 fascist policies are enacted
  const hasGameEnded: boolean = await _tryEndGameWithBoardCount(gameCode)
  if (!hasGameEnded) {
    await _nextElection(gameCode)
  }
}

export async function presidentialPower(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    if (
      gameData[constants.DATABASE_NODE_STATUS] !== ChamberStatus[ChamberStatus.presidentialPower] ||
      gameData[constants.DATABASE_NODE_PRESIDENTIAL_POWER] === PresidentialPower.DONE
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    let responseData: any

    if (gameData[constants.DATABASE_NODE_PRESIDENTIAL_POWER] === PresidentialPower.CONSUMED) {
      await admin
        .database()
        .ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(
          new GameDataUpdates({
            [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: PresidentialPower.DONE,
          }).updates,
        )

      await _nextElection(gameCode)
    } else {
      if (
        gameData[constants.DATABASE_NODE_SUB_STATUS] ===
        ChamberSubStatus[ChamberSubStatus.presidentialPower_policyPeek]
      ) {
        const topThreePolicies = gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][
          constants.DATABASE_NODE_DRAW_PILE
        ].slice(0, 3)

        responseData = {
          policies: topThreePolicies.join(","),
        }

        await admin
          .database()
          .ref()
          .child(constants.DATABASE_NODE_ONGOING_GAMES)
          .child(gameCode)
          .update(
            new GameDataUpdates({
              [constants.DATABASE_NODE_CURRENT_SESSION]: {
                [constants.DATABASE_NODE_POLICY_PEEK_THREE_POLICIES]: topThreePolicies,
              },
              [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: PresidentialPower.CONSUMED,
            }).updates,
          )
      }

      if (
        gameData[constants.DATABASE_NODE_SUB_STATUS] ===
        ChamberSubStatus[ChamberSubStatus.presidentialPower_investigateLoyalty]
      ) {
        const playerId: any = req.body[constants.REQUEST_PLAYER]

        if (playerId === undefined || typeof playerId !== "string") {
          handleMissingFields(res)
          return
        }

        const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
        const presidentId: string =
          gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID]
        if (
          !isValidPowerTarget(players, playerId, presidentId) ||
          findPlayer(players, playerId)[constants.DATABASE_NODE_IS_INVESTIGATED] === true
        ) {
          handleIneligiblePlayerError(res)
          return
        }

        const role: string = findPlayer(players, playerId)[constants.DATABASE_NODE_ROLE]

        responseData = {
          membership:
            role === PlayerRole[PlayerRole.liberal]
              ? PlayerMembership[PlayerMembership.liberal]
              : PlayerMembership[PlayerMembership.fascist],
        }

        const playerIndex: string = gameData[constants.DATABASE_NODE_PLAYERS].findIndex(
          (player: any) => player[constants.DATABASE_NODE_ID] == playerId,
        )

        await admin
          .database()
          .ref()
          .child(constants.DATABASE_NODE_ONGOING_GAMES)
          .child(gameCode)
          .update(
            new GameDataUpdates({
              [constants.DATABASE_NODE_CURRENT_SESSION]: {
                [constants.DATABASE_NODE_BEING_INVESTIGATED_PLAYER_ID]: playerId,
              },
              [constants.DATABASE_NODE_PLAYERS]: {
                [playerIndex]: {
                  [constants.DATABASE_NODE_IS_INVESTIGATED]: true,
                },
              },
              [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: PresidentialPower.CONSUMED,
            }).updates,
          )
      }

      if (
        gameData[constants.DATABASE_NODE_SUB_STATUS] ===
        ChamberSubStatus[ChamberSubStatus.presidentialPower_callSpecialElection]
      ) {
        const playerId: any = req.body[constants.REQUEST_PLAYER]

        if (playerId === undefined || typeof playerId !== "string") {
          handleMissingFields(res)
          return
        }

        if (
          !isValidPowerTarget(
            gameData[constants.DATABASE_NODE_PLAYERS],
            playerId,
            gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID],
          )
        ) {
          handleIneligiblePlayerError(res)
          return
        }

        await admin
          .database()
          .ref()
          .child(constants.DATABASE_NODE_ONGOING_GAMES)
          .child(gameCode)
          .update(
            new GameDataUpdates({
              [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: PresidentialPower.DONE,
              [constants.DATABASE_NODE_SPECIAL_ELECTION_PLAYER]: playerId,
            }).updates,
          )

        await _nextElection(gameCode, playerId)
      }

      if (
        gameData[constants.DATABASE_NODE_SUB_STATUS] ===
        ChamberSubStatus[ChamberSubStatus.presidentialPower_execution]
      ) {
        const playerId: any = req.body[constants.REQUEST_PLAYER]

        if (playerId === undefined || typeof playerId !== "string") {
          handleMissingFields(res)
          return
        }

        if (
          !isValidPowerTarget(
            gameData[constants.DATABASE_NODE_PLAYERS],
            playerId,
            gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID],
          )
        ) {
          handleIneligiblePlayerError(res)
          return
        }

        const playerIndex: string = gameData[constants.DATABASE_NODE_PLAYERS].findIndex(
          (player: any) => player[constants.DATABASE_NODE_ID] == playerId,
        )

        await _executePlayer(gameCode, playerId, playerIndex)
      }
    }

    handleSuccess(res, { code: gameCode, ...responseData })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

async function _executePlayer(gameCode: string, playerId: string, playerIndex: string) {
  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(
      new GameDataUpdates({
        [constants.DATABASE_NODE_CURRENT_SESSION]: {
          [constants.DATABASE_NODE_EXECUTED_PLAYER_ID]: playerId,
        },
        [constants.DATABASE_NODE_PLAYERS]: {
          [playerIndex]: {
            [constants.DATABASE_NODE_IS_EXECUTED]: true,
          },
        },
        [constants.DATABASE_NODE_PRESIDENTIAL_POWER]: PresidentialPower.DONE,
      }).updates,
    )

  // End game if hitler is executed
  if (await _tryEndGameOnExecution(gameCode)) {
    return
  }

  await _nextElection(gameCode)
}

async function _tryEndGameWithBoardCount(gameCode: string): Promise<boolean> {
  const gameData: any = await getGameData(gameCode)

  // 5 liberal policies are enacted
  const isLiberalWin: boolean =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] != null &&
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] != null &&
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][
      constants.DATABASE_NODE_LIBERAL
    ] === 5

  // 6 fascist policies are enacted
  const isFascistWin: boolean =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] != null &&
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] != null &&
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][
      constants.DATABASE_NODE_FASCIST
    ] === 6

  const hasGameEnded: boolean = isLiberalWin || isFascistWin

  if (hasGameEnded) {
    await _updatePreviousSessionsOnGameEnd(gameCode, isLiberalWin)
  }

  return hasGameEnded
}

async function _tryEndGameAfterGovernmentElection(gameCode: string): Promise<boolean> {
  const gameData: any = await getGameData(gameCode)

  const hitler: any = gameData[constants.DATABASE_NODE_PLAYERS].find(
    (player: any) => player[constants.DATABASE_NODE_ROLE] === PlayerRole[PlayerRole.hitler],
  )

  // Check if 3+ fascist policies are enacted and hitler is chancellor
  const isFascistWin: boolean =
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] != null &&
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] != null &&
    gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][
      constants.DATABASE_NODE_FASCIST
    ] >= 3 &&
    gameData[constants.DATABASE_NODE_CURRENT_SESSION] != null &&
    (gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_HAS_SUCCEEDED] ??
      false) &&
    gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID] ===
      hitler[constants.DATABASE_NODE_ID]

  if (isFascistWin) {
    await _updatePreviousSessionsOnGameEnd(gameCode, false)
  }

  return isFascistWin
}

async function _tryEndGameOnExecution(gameCode: string): Promise<boolean> {
  const gameData: any = await getGameData(gameCode)

  const hitler: any = gameData[constants.DATABASE_NODE_PLAYERS].find(
    (player: any) => player[constants.DATABASE_NODE_ROLE] === PlayerRole[PlayerRole.hitler],
  )

  // Check if hitler is executed
  const isLiberalWin: boolean = hitler[constants.DATABASE_NODE_IS_EXECUTED]

  if (isLiberalWin) {
    await _updatePreviousSessionsOnGameEnd(gameCode, true)
  }

  return isLiberalWin
}

async function _updatePreviousSessionsOnGameEnd(
  gameCode: string,
  isLiberalWin: boolean,
): Promise<void> {
  const gameData: any = await getGameData(gameCode)

  const sessionCount: number = (gameData[constants.DATABASE_NODE_SESSIONS] ?? []).length

  await admin
    .database()
    .ref()
    .child(constants.DATABASE_NODE_ONGOING_GAMES)
    .child(gameCode)
    .update(
      new GameDataUpdates({
        [constants.DATABASE_NODE_SESSIONS]: {
          [sessionCount]: gameData[constants.DATABASE_NODE_CURRENT_SESSION],
        },
        [`${constants.DATABASE_NODE_CURRENT_SESSION}.override`]: undefined,
        [constants.DATABASE_NODE_PENDING_TRANSITION]: null,
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.gameEnded],
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[
            isLiberalWin ? ChamberSubStatus.gameEnded_liberal : ChamberSubStatus.gameEnded_fascist
          ],
      }).updates,
    )
}

export async function askForVeto(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    if (
      gameData[constants.DATABASE_NODE_SUB_STATUS] !==
      ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy]
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    if (
      gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] == null ||
      gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] == null ||
      gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][
        constants.DATABASE_NODE_FASCIST
      ] == null
    ) {
      handleUnexpectedInternalError(res)
      return
    }

    if (
      gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][
        constants.DATABASE_NODE_FASCIST
      ] < 5 ||
      gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_IS_VETO_REFUSED] ===
        true
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(
        new GameDataUpdates({
          [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
          [constants.DATABASE_NODE_SUB_STATUS]:
            ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorSeekingVeto],
        }).updates,
      )

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

export async function answerVeto(req: Request, res: Response): Promise<void> {
  try {
    const gameCode: string = res.locals.gameCode
    const gameData: any = res.locals.gameData

    if (
      gameData[constants.DATABASE_NODE_STATUS] == null ||
      gameData[constants.DATABASE_NODE_SUB_STATUS] == null
    ) {
      handleUnexpectedInternalError(res)
      return
    }

    if (
      gameData[constants.DATABASE_NODE_SUB_STATUS] !==
      ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorSeekingVeto]
    ) {
      handleGameProgressTamperingError(res)
      return
    }

    const refuseVeto: any = req.body[constants.REQUEST_REFUSE_VETO]

    if (refuseVeto == null || typeof refuseVeto !== "boolean") {
      handleMissingFields(res)
      return
    }

    const electionTracker: number = gameData[constants.DATABASE_NODE_ELECTION_TRACKER]

    const gameDataUpdates: GameDataUpdates = new GameDataUpdates()

    if (refuseVeto) {
      gameDataUpdates.push({
        [constants.DATABASE_NODE_CURRENT_SESSION]: {
          [constants.DATABASE_NODE_IS_VETO_REFUSED]: refuseVeto,
        },
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy],
      })
    } else {
      const chancellorPolicies: string[] =
        gameData[constants.DATABASE_NODE_CURRENT_SESSION][
          constants.DATABASE_NODE_CHANCELLOR_POLICIES
        ]

      const policiesCount: any = chancellorPolicies.reduce(
        (count: any, currentValue: string) => (
          count[currentValue] ? ++count[currentValue] : (count[currentValue] = 1), count
        ),
        {},
      )

      gameDataUpdates.push({
        [constants.DATABASE_NODE_CURRENT_SESSION]: {
          [constants.DATABASE_NODE_IS_VETO_REFUSED]: refuseVeto,
        },
        [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
          [constants.DATABASE_NODE_DISCARD_PILE]: {
            [constants.DATABASE_NODE_LIBERAL]: ServerValue.increment(
              policiesCount[Policy.LIBERAL] ?? 0,
            ),
            [constants.DATABASE_NODE_FASCIST]: ServerValue.increment(
              policiesCount[Policy.FASCIST] ?? 0,
            ),
          },
        },
        [constants.DATABASE_NODE_ELECTION_TRACKER]: ServerValue.increment(1),
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
        [constants.DATABASE_NODE_SUB_STATUS]:
          ChamberSubStatus[ChamberSubStatus.legislativeSession_sessionEndedWithVeto],
      })
    }

    await admin
      .database()
      .ref()
      .child(constants.DATABASE_NODE_ONGOING_GAMES)
      .child(gameCode)
      .update(gameDataUpdates.updates)

    if (!refuseVeto) {
      // The veto ended the legislative session with both policies discarded.
      await _prepareDrawPile(gameCode)

      if (electionTracker + 1 == 3) {
        await scheduleTransition(
          gameCode,
          pendingTransition(TransitionKind.frustratedPopulace, RESULT_PAUSE_MS),
        )
      } else {
        await _nextElection(gameCode)
      }
    }

    handleSuccess(res, { code: gameCode })
    return
  } catch (err) {
    handleInternalError(res, err)
    return
  }
}

async function _runTransition(gameCode: string, transition: PendingTransition): Promise<void> {
  switch (transition.kind) {
    case TransitionKind.finishSetup:
      return _finishSetup(gameCode)
    case TransitionKind.beginLegislativeSession:
      return _beginLegislativeSession(gameCode)
    case TransitionKind.frustratedPopulace:
      return _enactPolicyByFrustratedPopulace(gameCode)
    case TransitionKind.nextElection:
      return _startNextElection(gameCode, transition.specialElectionPresidentId)
  }
}

/**
 * Applies the game's pending transition if its pause is over, and any transition that becomes
 * due as a result. Must run while holding the game's lock. Returns whether anything changed.
 */
export async function runDueTransitions(gameCode: string, gameData: any): Promise<boolean> {
  let changed: boolean = false
  let pending: PendingTransition | undefined =
    gameData?.[constants.DATABASE_NODE_PENDING_TRANSITION]

  // A transition never schedules one that is already due, so this is a safety limit
  for (let step: number = 0; step < 5 && isDue(pending); step++) {
    const transition: PendingTransition = pending as PendingTransition
    await _runTransition(gameCode, transition)
    changed = true

    const after: any = await getGameData(gameCode)
    pending = after?.[constants.DATABASE_NODE_PENDING_TRANSITION]
    if (pending?.at === transition.at && pending?.kind === transition.kind) {
      // The transition couldn't clear itself (an unexpected game state): drop it rather than
      // retry it on every request.
      console.error(`Transition ${transition.kind} of game ${gameCode} failed, dropping it`)
      await admin
        .database()
        .ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .child(constants.DATABASE_NODE_PENDING_TRANSITION)
        .remove()
      break
    }
  }

  return changed
}

/**
 * Lets a client move the game on once a pause is over: due transitions are applied before any
 * request reaches this handler (see pendingTransitionHandler). Responds with the time of the
 * transition still pending, if any, so a client whose clock ran ahead can try again then.
 */
export async function advance(req: Request, res: Response): Promise<void> {
  const pending: PendingTransition | undefined =
    res.locals.gameData[constants.DATABASE_NODE_PENDING_TRANSITION]
  handleSuccess(res, {
    code: res.locals.gameCode,
    ...(pending != null ? { pendingTransitionAt: pending.at } : {}),
  })
}
