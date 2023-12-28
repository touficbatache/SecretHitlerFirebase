import { Request, Response } from "express"
import {
    handleCreated,
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
    sleep,
} from "./utils"
import * as admin from "firebase-admin"
import { database } from "firebase-admin"
import * as constants from "./constants"
import {
    AssetReference,
    ChamberStatus,
    ChamberSubStatus,
    ExecutiveAction,
    GameType,
    PlayerGeneratedRoleHolder,
    PlayerMembership,
    PlayerRole,
    Policy,
} from "./objects"
import { GameDataUpdates, getGameData } from "./handlers/game-data-handler"
import Reference = database.Reference

export async function newGame(req: Request, res: Response): Promise<Response> {
    try {
        const userId: string = process.env.DEV === "true" ? "randId0" : res.locals.uid
        const userName: string = process.env.DEV === "true" ? "randName0" : res.locals.name
        const temp: string = _randomGameCode().toString()

        const gameCreationTries: number = 1
        while (gameCreationTries <= 3) {
            const gameCodeAvailable: boolean = !(await admin.database().ref().child(constants.DATABASE_NODE_ONGOING_GAMES).child(temp).get()).exists()
            if (gameCodeAvailable) {
                await admin.database().ref()
                    .child(constants.DATABASE_NODE_ONGOING_GAMES)
                    .child(temp)
                    .set({
                        [constants.DATABASE_NODE_OWNER_ID]: userId,
                        [constants.DATABASE_NODE_CREATED_AT]: Date.now(),
                        [constants.DATABASE_NODE_PLAYERS]: [_user(userId, userName)],
                        [constants.DATABASE_NODE_CONNECTED]: { [userId]: true },
                        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.waiting],
                        [constants.DATABASE_NODE_ELECTION_TRACKER]: 0,
                    })

                return handleCreated(res, { code: temp })
            }
        }

        return handleInternalErrorWithMessage(res, "Game creation failed")
    } catch (err) {
        return handleInternalError(res, err)
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

export async function joinGame(req: Request, res: Response): Promise<Response> {
    try {
        const userId: string = process.env.DEV === "true" ? `randId${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}` : res.locals.uid
        const userName: string = process.env.DEV === "true" ? `randName${res.locals.gameData[constants.DATABASE_NODE_PLAYERS].length}` : res.locals.name
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
        if (players.some((player: any) => player[constants.DATABASE_NODE_ID] === userId)) {
            return handlePlayerAlreadyInGame(res)
        }

        if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
            return handleGameStartedError(res)
        }

        const newPlayerRef: Reference = await admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .child(constants.DATABASE_NODE_PLAYERS)
            .push()
        await newPlayerRef.setWithPriority(_user(userId, userName), admin.database.ServerValue.TIMESTAMP.toString())

        await admin.database().ref()
          .child(constants.DATABASE_NODE_ONGOING_GAMES)
          .child(gameCode)
          .child(constants.DATABASE_NODE_CONNECTED)
          .child(userId)
          .set(true)

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

function _user(id: string, name: string) {
    return {
        [constants.DATABASE_NODE_ID]: id,
        [constants.DATABASE_NODE_NAME]: name,
    }
}

export async function startGame(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        const hidePicsGameInfo: any = req.body[constants.REQUEST_HIDE_PICS_GAME_INFO]
        const skipLongIntro: any = req.body[constants.REQUEST_SKIP_LONG_INTRO]

        if (hidePicsGameInfo == null || typeof hidePicsGameInfo !== "boolean"
            || skipLongIntro == null || typeof skipLongIntro !== "boolean") {
            return handleMissingFields(res)
        }

        if (gameData[constants.DATABASE_NODE_STATUS] != ChamberStatus[ChamberStatus.waiting]) {
            return handleGameStartedError(res)
        }

        const playerCount: number = gameData[constants.DATABASE_NODE_PLAYERS].length
        if (playerCount < 5) {
            return handleNotEnoughPlayersError(res)
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

        const playersWithRoles: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
            .map((e: any, index: number) => _player(e, roles[index]))

        const presidentPlayerId: string = _randomPresidentPlayerId(gameData[constants.DATABASE_NODE_PLAYERS])

        await admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
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
            }).updates)

        void _finishSetup(gameCode, gameType, skipLongIntro)

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
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

async function _finishSetup(gameCode: string, gameType: GameType, skipLongIntro: boolean) {
    void admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .child(constants.DATABASE_NODE_STARTED_AT)
        .set(Date.now())

    const waitTimeInS: number = skipLongIntro ? 5 : 30
    await sleep(waitTimeInS * 1000)

    void admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(new GameDataUpdates({
            [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.election],
            [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.election_presidentChoosingChancellor],
        }).updates)
}

export async function chooseChancellor(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        const chancellorId: any = req.body[constants.REQUEST_CHANCELLOR_ID]

        if (chancellorId == null || typeof chancellorId !== "string") {
            return handleMissingFields(res)
        }

        if (gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID] != null) {
            return handleGameProgressTamperingError(res)
        }

        const presidentId: string = gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID]
        const lastSuccessfulChancellorId: string = gameData[constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID]
        const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
        if (chancellorId == presidentId || chancellorId == lastSuccessfulChancellorId || !players.map((player: any) => player[constants.DATABASE_NODE_ID]).includes(chancellorId)) {
            return handleIneligiblePlayerError(res)
        }

        void admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
                [constants.DATABASE_NODE_CURRENT_SESSION]: {
                    [constants.DATABASE_NODE_CHANCELLOR_ID]: chancellorId,
                },
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.election],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.election_voting],
            }).updates)

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

export async function vote(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        const vote: any = req.body[constants.REQUEST_VOTE]

        if (vote == null || typeof vote !== "boolean") {
            return handleMissingFields(res)
        }

        if (
            gameData[constants.DATABASE_NODE_CURRENT_SESSION] == null
            || gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID] == null
            || gameData[constants.DATABASE_NODE_SUB_STATUS] != ChamberSubStatus[ChamberSubStatus.election_voting]
        ) {
            return handleGameProgressTamperingError(res)
        }

        const userId: string = process.env.DEV === "true" ? `randId${Object.values(gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES] ?? {}).length}` : res.locals.uid

        if (gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES] != null
            && gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES][userId] != null) {
            return handleGameProgressTamperingError(res)
        }

        const gameDataUpdates: GameDataUpdates = new GameDataUpdates()

        gameDataUpdates.push({
            [constants.DATABASE_NODE_CURRENT_SESSION]: {
                [constants.DATABASE_NODE_VOTES]: {
                    [userId]: vote,
                },
            },
        })

        const playerCount: number = gameData[constants.DATABASE_NODE_PLAYERS].length
        const voteCount: number = Object.values(gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES] ?? []).length + 1

        const hasVoteEnded: boolean = playerCount === voteCount
        let hasSucceeded: boolean = false

        if (hasVoteEnded) {
            gameDataUpdates.push({ [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.election_votingEnded] })

            const yaCount: number = Object.values<boolean>(gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_VOTES]).filter((element: boolean) => element).length + (vote ? 1 : 0)
            hasSucceeded = yaCount > (gameData[constants.DATABASE_NODE_PLAYERS] as any[]).filter((player: any) => !player[constants.DATABASE_NODE_IS_EXECUTED]).length / 2.0
            gameDataUpdates.push({
                [constants.DATABASE_NODE_CURRENT_SESSION]: {
                    [constants.DATABASE_NODE_HAS_SUCCEEDED]: hasSucceeded,
                },
            })
            if (hasSucceeded) {
                gameDataUpdates.push({ [constants.DATABASE_NODE_ELECTION_TRACKER]: 0 })
                gameDataUpdates.push({ [constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID]: gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID] })
            } else {
                gameDataUpdates.push({ [constants.DATABASE_NODE_ELECTION_TRACKER]: admin.database.ServerValue.increment(1) })
            }
        }

        await admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(gameDataUpdates.updates)

        if (hasVoteEnded) {
            if (hasSucceeded) {
                void _beginLegislativeSession(gameCode)
            } else {
                if (gameData[constants.DATABASE_NODE_ELECTION_TRACKER] + 1 == 3) {
                    void _enactPolicyByFrustratedPopulace(gameCode)
                } else {
                    void _nextElection(gameCode)
                }
            }
        }

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

async function _prepareDrawPile(gameCode: string) {
    const gameData: any = await getGameData(gameCode)

    const drawPile: string[] = gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE]
    const discardPile: any = gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DISCARD_PILE]

    if (drawPile.length < 3) {
        const mixedPolicies: string[] = drawPile
        mixedPolicies.push(
            ..._generateDrawPile(
                discardPile[constants.DATABASE_NODE_LIBERAL] ?? 0,
                discardPile[constants.DATABASE_NODE_FASCIST] ?? 0,
            ),
        )

        void admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
                [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
                    [constants.DATABASE_NODE_DRAW_PILE]: mixedPolicies,
                    [constants.DATABASE_NODE_DISCARD_PILE]: null,
                },
            }).updates)
    }
}

async function _enactPolicyByFrustratedPopulace(gameCode: string) {
    await sleep(5000)

    const gameData: any = await getGameData(gameCode)
    const gameDataUpdates: GameDataUpdates = new GameDataUpdates()

    const firstPolicy: Policy = gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE][0]
    if (firstPolicy == null) {
        // TODO: make sure error is logged
        console.error(`500 - Unexpected error`)
        return
    }

    gameDataUpdates.push({ [constants.DATABASE_NODE_ELECTION_TRACKER]: 0 })
    gameDataUpdates.push({ [constants.DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID]: null })

    gameDataUpdates.push({
        [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
            [constants.DATABASE_NODE_DRAW_PILE]: gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE].slice(1),
        },
    })

    const firstPolicyPileNode: string = firstPolicy == Policy.LIBERAL ? constants.DATABASE_NODE_LIBERAL : constants.DATABASE_NODE_FASCIST
    gameDataUpdates.push({
        [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
            [constants.DATABASE_NODE_BOARD]: {
                [firstPolicyPileNode]: admin.database.ServerValue.increment(1),
            },
        },
    })

    await admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(gameDataUpdates.updates)

    void _nextElection(gameCode, true)
}

async function _nextElection(
    gameCode: string,
    skipWaitTime: boolean = false,
    specialElectionPresidentId: string | undefined = undefined,
) {
    if (!skipWaitTime) await sleep(5000)

    const gameData: any = await getGameData(gameCode)

    const sessionCount: number = (gameData[constants.DATABASE_NODE_SESSIONS] ?? []).length
    const players: any[] = gameData[constants.DATABASE_NODE_PLAYERS]
    const lastPresidentIndex: number = players.findIndex((player: any) => player[constants.DATABASE_NODE_ID] == gameData[constants.DATABASE_NODE_LAST_PRESIDENT_ID])
    const nextPresidentId: string = specialElectionPresidentId ?? _nextPresidentId(players, lastPresidentIndex)

    const gameDataUpdates: GameDataUpdates = new GameDataUpdates({
        [`${constants.DATABASE_NODE_CURRENT_SESSION}.override`]: {
            [constants.DATABASE_NODE_PRESIDENT_ID]: nextPresidentId,
            [constants.DATABASE_NODE_IS_SPECIAL_ELECTION]: specialElectionPresidentId !== undefined,
        },
        [constants.DATABASE_NODE_SESSIONS]: {
            [sessionCount]: gameData[constants.DATABASE_NODE_CURRENT_SESSION],
        },
        [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.election],
        [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.election_presidentChoosingChancellor],
    })

    if (specialElectionPresidentId === undefined) {
        gameDataUpdates.push({ [constants.DATABASE_NODE_LAST_PRESIDENT_ID]: nextPresidentId })
    }

    void admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(gameDataUpdates.updates)
}

function _nextPresidentId(players: any[], lastPresidentIndex: number): string {
    const nextPresidentIndex: number = (lastPresidentIndex == players.length - 1) ? 0 : lastPresidentIndex + 1
    if (players[nextPresidentIndex][constants.DATABASE_NODE_IS_EXECUTED]) {
        return _nextPresidentId(players, nextPresidentIndex)
    }
    return players[nextPresidentIndex][constants.DATABASE_NODE_ID]
}

async function _beginLegislativeSession(gameCode: string) {
    if (await _endGameIfPossible(gameCode)) {
        return
    }

    await sleep(5000)

    await _prepareDrawPile(gameCode)

    const gameData: any = await getGameData(gameCode)

    const topPolicies: string[] = gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE]
    const otherPolicies: string[] = topPolicies.splice(3)

    void admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(new GameDataUpdates({
            [constants.DATABASE_NODE_CURRENT_SESSION]: {
                [constants.DATABASE_NODE_PRESIDENT_POLICIES]: topPolicies,
            },
            [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
                [constants.DATABASE_NODE_DRAW_PILE]: otherPolicies,
            },
            [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
            [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_presidentDiscardingPolicy],
        }).updates)
}

export async function presidentDiscardPolicy(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        const discardedPolicy: any = req.body[constants.REQUEST_POLICY]

        if (discardedPolicy == null || typeof discardedPolicy !== "string") {
            return handleMissingFields(res)
        }

        const presidentPolicies: string[] = gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES]

        if (
            gameData[constants.DATABASE_NODE_SUB_STATUS] != ChamberSubStatus[ChamberSubStatus.legislativeSession_presidentDiscardingPolicy]
            || presidentPolicies.length !== 3
            || !presidentPolicies.includes(discardedPolicy)
        ) {
            return handleGameProgressTamperingError(res)
        }

        presidentPolicies.splice(presidentPolicies.indexOf(discardedPolicy), 1)

        await admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
                [constants.DATABASE_NODE_CURRENT_SESSION]: {
                    [constants.DATABASE_NODE_CHANCELLOR_POLICIES]: presidentPolicies,
                },
                [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
                    [constants.DATABASE_NODE_DISCARD_PILE]: {
                        [discardedPolicy]: admin.database.ServerValue.increment(1),
                    },
                },
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy],
            }).updates)

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

export async function chancellorDiscardPolicy(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        const discardedPolicy: any = req.body[constants.REQUEST_POLICY]

        if (discardedPolicy == null || typeof discardedPolicy !== "string") {
            return handleMissingFields(res)
        }

        const chancellorPolicies: string[] = gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_POLICIES]

        if (
            gameData[constants.DATABASE_NODE_SUB_STATUS] != ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy]
            || chancellorPolicies.length !== 2
            || !chancellorPolicies.includes(discardedPolicy)
        ) {
            return handleGameProgressTamperingError(res)
        }

        chancellorPolicies.splice(chancellorPolicies.indexOf(discardedPolicy), 1)

        const boardPolicy: string = chancellorPolicies[0]

        await admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
                [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
                    [constants.DATABASE_NODE_DISCARD_PILE]: {
                        [discardedPolicy]: admin.database.ServerValue.increment(1),
                    },
                    [constants.DATABASE_NODE_BOARD]: {
                        [boardPolicy]: admin.database.ServerValue.increment(1),
                    },
                },
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_sessionEndedWithPolicyEnactment],
            }).updates)

        const hasGameEnded: boolean = await _endGameIfPossible(gameCode)

        if (!hasGameEnded) {
            void _onEnactPolicy(gameCode, boardPolicy)
        }

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

async function _onEnactPolicy(gameCode: string, enactedPolicy: string) {
    const gameData: any = await getGameData(gameCode)

    const policy: Policy = enactedPolicy
    if (enactedPolicy == null) {
        // TODO: make sure error is logged
        console.error(`500 - Unexpected error`)
        return
    }

    if (policy == Policy.FASCIST) {
        const index: number = gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][constants.DATABASE_NODE_FASCIST]
        if (Object.prototype.hasOwnProperty.call(gameData[constants.DATABASE_NODE_EXECUTIVE_ACTIONS], index)) {
            const presidentialPower: ExecutiveAction = gameData[constants.DATABASE_NODE_EXECUTIVE_ACTIONS][index]
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

            void admin.database().ref()
                .child(constants.DATABASE_NODE_ONGOING_GAMES)
                .child(gameCode)
                .update(new GameDataUpdates({
                    [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.presidentialPower],
                    [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[subStatus],
                }).updates)

            return
        }
    }

    await admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(new GameDataUpdates({
            [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
            [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_sessionEndedWithPolicyEnactment],
        }).updates)

    void _nextElection(gameCode)
}

export async function presidentialPower(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        if (gameData[constants.DATABASE_NODE_STATUS] !== ChamberStatus[ChamberStatus.presidentialPower]) {
            return handleGameProgressTamperingError(res)
        }

        let responseData: any

        if (gameData[constants.DATABASE_NODE_SUB_STATUS] === ChamberSubStatus[ChamberSubStatus.presidentialPower__consumed]) {
            void _nextElection(gameCode)
        } else {
            if (gameData[constants.DATABASE_NODE_SUB_STATUS] === ChamberSubStatus[ChamberSubStatus.presidentialPower_policyPeek]) {
                responseData = {
                    policies: gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_DRAW_PILE].slice(0, 3).join(','),
                }

                await admin.database().ref()
                    .child(constants.DATABASE_NODE_ONGOING_GAMES)
                    .child(gameCode)
                    .update(new GameDataUpdates({ [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.presidentialPower__consumed] }).updates)
            }

            if (gameData[constants.DATABASE_NODE_SUB_STATUS] === ChamberSubStatus[ChamberSubStatus.presidentialPower_investigateLoyalty]) {
                const playerId: any = req.body[constants.REQUEST_PLAYER]

                if (playerId === undefined || typeof playerId !== "string") {
                    return handleMissingFields(res)
                }

                const player: any = gameData[constants.DATABASE_NODE_PLAYERS].find((p: any) => p[constants.DATABASE_NODE_ID] === playerId)

                if (playerId === gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID] ||
                    player[constants.DATABASE_NODE_IS_INVESTIGATED] === true) {
                    return handleIneligiblePlayerError(res)
                }

                const role: string = player[constants.DATABASE_NODE_ROLE]

                responseData = {
                    membership: role === PlayerRole[PlayerRole.liberal] ? PlayerMembership[PlayerMembership.liberal] : PlayerMembership[PlayerMembership.fascist],
                }

                const playerIndex: string = gameData[constants.DATABASE_NODE_PLAYERS].findIndex((player: any) => player[constants.DATABASE_NODE_ID] == playerId)

                await admin.database().ref()
                    .child(constants.DATABASE_NODE_ONGOING_GAMES)
                    .child(gameCode)
                    .update(new GameDataUpdates({
                        [constants.DATABASE_NODE_CURRENT_SESSION]: {
                            [constants.DATABASE_NODE_BEING_INVESTIGATED_PLAYER_ID]: playerId,
                        },
                        [constants.DATABASE_NODE_PLAYERS]: {
                            [playerIndex]: {
                                [constants.DATABASE_NODE_IS_INVESTIGATED]: true,
                            },
                        },
                        [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.presidentialPower__consumed],
                    }).updates)
            }

            if (gameData[constants.DATABASE_NODE_SUB_STATUS] === ChamberSubStatus[ChamberSubStatus.presidentialPower_callSpecialElection]) {
                const playerId: any = req.body[constants.REQUEST_PLAYER]

                if (playerId === undefined || typeof playerId !== "string") {
                    return handleMissingFields(res)
                }

                if (playerId === gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID]) {
                    return handleIneligiblePlayerError(res)
                }

                void _nextElection(gameCode, false, playerId)
            }

            if (gameData[constants.DATABASE_NODE_SUB_STATUS] === ChamberSubStatus[ChamberSubStatus.presidentialPower_execution]) {
                const playerId: any = req.body[constants.REQUEST_PLAYER]

                if (playerId === undefined || typeof playerId !== "string") {
                    return handleMissingFields(res)
                }

                if (playerId === gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_ID]) {
                    return handleIneligiblePlayerError(res)
                }

                const playerIndex: string = gameData[constants.DATABASE_NODE_PLAYERS].findIndex((player: any) => player[constants.DATABASE_NODE_ID] == playerId)

                void _executePlayer(gameCode, playerIndex)
            }
        }

        return handleSuccess(res, { code: gameCode, ...responseData })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

async function _executePlayer(gameCode: string, playerIndex: string) {
    await admin.database().ref()
        .child(constants.DATABASE_NODE_ONGOING_GAMES)
        .child(gameCode)
        .update(new GameDataUpdates({
            [constants.DATABASE_NODE_PLAYERS]: {
                [playerIndex]: {
                    [constants.DATABASE_NODE_IS_EXECUTED]: true,
                },
            },
        }).updates)

    if (await _endGameIfPossible(gameCode)) {
        return
    }

    void _nextElection(gameCode)
}

async function _endGameIfPossible(gameCode: string): Promise<boolean> {
    const gameData: any = await getGameData(gameCode)

    const hitler: any = gameData[constants.DATABASE_NODE_PLAYERS].find((player: any) => player[constants.DATABASE_NODE_ROLE] === PlayerRole[PlayerRole.hitler])

    // 5 liberal policies are enacted, or hitler is executed
    const isLiberalWin: boolean =
        (gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] != null &&
            gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] != null &&
            gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][constants.DATABASE_NODE_LIBERAL] === 5) ||
        hitler[constants.DATABASE_NODE_IS_EXECUTED]

    // 6 fascist policies are enacted, or 3+ are enacted and  hitler is chancellor
    const isFascistWin: boolean =
        gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] != null &&
        gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] != null &&
        (
            gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][constants.DATABASE_NODE_FASCIST] === 6 ||
            (
                gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][constants.DATABASE_NODE_FASCIST] >= 3 &&
                gameData[constants.DATABASE_NODE_CURRENT_SESSION] != null &&
                (gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_HAS_SUCCEEDED] ?? false) &&
                gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_CHANCELLOR_ID] === hitler[constants.DATABASE_NODE_ID]
            )
        )

    const sessionCount: number = (gameData[constants.DATABASE_NODE_SESSIONS] ?? []).length

    const hasGameEnded: boolean = isLiberalWin || isFascistWin

    if (hasGameEnded) {
        void admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
                [constants.DATABASE_NODE_SESSIONS]: {
                    [sessionCount]: gameData[constants.DATABASE_NODE_CURRENT_SESSION],
                },
                [`${constants.DATABASE_NODE_CURRENT_SESSION}.override`]: undefined,
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.gameEnded],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[isLiberalWin ? ChamberSubStatus.gameEnded_liberal : ChamberSubStatus.gameEnded_fascist],
            }).updates)
    }

    return hasGameEnded
}

export async function askForVeto(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        if (gameData[constants.DATABASE_NODE_CHAMBER_POLICIES] == null ||
            gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD] == null ||
            gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][constants.DATABASE_NODE_FASCIST] == null) {
            return handleUnexpectedInternalError(res)
        }

        if (gameData[constants.DATABASE_NODE_CHAMBER_POLICIES][constants.DATABASE_NODE_BOARD][constants.DATABASE_NODE_FASCIST] < 5) {
            return handleGameProgressTamperingError(res)
        }

        void admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(new GameDataUpdates({
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorSeekingVeto],
            }).updates)

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}

export async function answerVeto(req: Request, res: Response): Promise<Response> {
    try {
        const gameCode: string = res.locals.gameCode
        const gameData: any = res.locals.gameData

        if (gameData[constants.DATABASE_NODE_STATUS] == null ||
            gameData[constants.DATABASE_NODE_SUB_STATUS] == null) {
            return handleUnexpectedInternalError(res)
        }

        if (gameData[constants.DATABASE_NODE_SUB_STATUS] !== ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorSeekingVeto]) {
            return handleGameProgressTamperingError(res)
        }

        const refuseVeto: any = req.body[constants.REQUEST_REFUSE_VETO]

        if (refuseVeto == null || typeof refuseVeto !== "boolean") {
            return handleMissingFields(res)
        }

        const gameDataUpdates: GameDataUpdates = new GameDataUpdates()

        if (refuseVeto) {
            gameDataUpdates.push({
                [constants.DATABASE_NODE_CURRENT_SESSION]: {
                    [constants.DATABASE_NODE_IS_VETO_REFUSED]: refuseVeto,
                },
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_chancellorDiscardingPolicy],
            })
        } else {
            const presidentPolicies: string[] = gameData[constants.DATABASE_NODE_CURRENT_SESSION][constants.DATABASE_NODE_PRESIDENT_POLICIES]

            const policiesCount: any = presidentPolicies.reduce(
                (count: any, currentValue: string) => ((count[currentValue] ? ++count[currentValue] : (count[currentValue] = 1)), count),
                {},
            )

            gameDataUpdates.push({
                [constants.DATABASE_NODE_CHAMBER_POLICIES]: {
                    [constants.DATABASE_NODE_DISCARD_PILE]: {
                        [constants.DATABASE_NODE_LIBERAL]: admin.database.ServerValue.increment(policiesCount[Policy.LIBERAL] ?? 0),
                        [constants.DATABASE_NODE_FASCIST]: admin.database.ServerValue.increment(policiesCount[Policy.FASCIST] ?? 0),
                    },
                },
                [constants.DATABASE_NODE_STATUS]: ChamberStatus[ChamberStatus.legislativeSession],
                [constants.DATABASE_NODE_SUB_STATUS]: ChamberSubStatus[ChamberSubStatus.legislativeSession_sessionEndedWithVeto],
            })
        }

        await admin.database().ref()
            .child(constants.DATABASE_NODE_ONGOING_GAMES)
            .child(gameCode)
            .update(gameDataUpdates.updates)

        if (!refuseVeto) {
            void _nextElection(gameCode)
        }

        return handleSuccess(res, { code: gameCode })
    } catch (err) {
        return handleInternalError(res, err)
    }
}
