/**
 * Realtime Database Nodes
 */
/// global
export const DATABASE_NODE_ID: string = "id"

/// root
export const DATABASE_NODE_ONGOING_GAMES: string = "ongoingGames"

/// Chamber
export const DATABASE_NODE_OWNER_ID: string = "ownerId"
export const DATABASE_NODE_CREATED_AT: string = "createdAt"
export const DATABASE_NODE_STARTED_AT: string = "startedAt"
export const DATABASE_NODE_PLAYERS: string = "players"
export const DATABASE_NODE_CONNECTED: string = "connected"
export const DATABASE_NODE_GAME_TYPE: string = "gameType"
export const DATABASE_NODE_CURRENT_SESSION: string = "currentSession"
export const DATABASE_NODE_SESSIONS: string = "sessions"
export const DATABASE_NODE_ELECTION_TRACKER: string = "electionTracker"
export const DATABASE_NODE_LAST_PRESIDENT_ID: string = "lastPresidentId"
export const DATABASE_NODE_LAST_SUCCESSFUL_CHANCELLOR_ID: string = "lastSuccessfulChancellorId"
export const DATABASE_NODE_CHAMBER_POLICIES: string = "policies"
export const DATABASE_NODE_EXECUTIVE_ACTIONS: string = "executiveActions"
export const DATABASE_NODE_PRESIDENTIAL_POWER: string = "presidentialPower"
export const DATABASE_NODE_SPECIAL_ELECTION_PLAYER: string = "specialElectionPlayer"
export const DATABASE_NODE_SETTINGS: string = "settings"
export const DATABASE_NODE_STATUS: string = "status"
export const DATABASE_NODE_SUB_STATUS: string = "subStatus"

/// Player
export const DATABASE_NODE_NAME: string = "name"
export const DATABASE_NODE_ROLE: string = "role"
export const DATABASE_NODE_ASSET_REFERENCE: string = "assetReference"
export const DATABASE_NODE_IS_EXECUTED: string = "isExecuted"
export const DATABASE_NODE_IS_INVESTIGATED: string = "isInvestigated"

/// Session
export const DATABASE_NODE_PRESIDENT_ID: string = "presidentId"
export const DATABASE_NODE_CHANCELLOR_ID: string = "chancellorId"
export const DATABASE_NODE_IS_SPECIAL_ELECTION: string = "isSpecialElection"
export const DATABASE_NODE_VOTES: string = "votes"
export const DATABASE_NODE_PRESIDENT_POLICIES: string = "presidentPolicies"
export const DATABASE_NODE_CHANCELLOR_POLICIES: string = "chancellorPolicies"
export const DATABASE_NODE_HAS_SUCCEEDED: string = "hasSucceeded"
export const DATABASE_NODE_IS_VETO_REFUSED: string = "isVetoRefused"
export const DATABASE_NODE_BEING_INVESTIGATED_PLAYER_ID: string = "beingInvestigatedPlayerId"

/// Policies
export const DATABASE_NODE_DRAW_PILE: string = "drawPile"
export const DATABASE_NODE_DISCARD_PILE: string = "discardPile"
export const DATABASE_NODE_BOARD: string = "board"
export const DATABASE_NODE_LIBERAL: string = "liberal"
export const DATABASE_NODE_FASCIST: string = "fascist"

/// Settings
export const DATABASE_NODE_HIDE_PICS_GAME_INFO: string = "hidePicsGameInfo"
export const DATABASE_NODE_SKIP_LONG_INTRO: string = "skipLongIntro"


/**
 * POST request constants
 */
export const REQUEST_HIDE_PICS_GAME_INFO: string = "hidePicsGameInfo"
export const REQUEST_SKIP_LONG_INTRO: string = "skipLongIntro"
export const REQUEST_CHANCELLOR_ID: string = "chancellorId"
export const REQUEST_VOTE: string = "vote"
export const REQUEST_POLICY: string = "policy"
export const REQUEST_PLAYER: string = "player"
export const REQUEST_IS_DONE: string = "done"
export const REQUEST_REFUSE_VETO: string = "refuseVeto"
