export enum ChamberStatus {
  waiting = "waiting",
  settingUp = "settingUp",
  election = "election",
  legislativeSession = "legislativeSession",
  presidentialPower = "presidentialPower",
  gameEnded = "gameEnded",
  /** The owner left the lobby: players see the game emptied, then it is removed. */
  deleted = "deleted",
}

export enum ChamberSubStatus {
  election_presidentChoosingChancellor = "election_presidentChoosingChancellor",
  election_voting = "election_voting",
  election_votingEnded = "election_votingEnded",
  legislativeSession_presidentDiscardingPolicy = "legislativeSession_presidentDiscardingPolicy",
  legislativeSession_chancellorDiscardingPolicy = "legislativeSession_chancellorDiscardingPolicy",
  legislativeSession_sessionEndedWithPolicyEnactment = "legislativeSession_sessionEndedWithPolicyEnactment",
  legislativeSession_chancellorSeekingVeto = "legislativeSession_chancellorSeekingVeto",
  legislativeSession_sessionEndedWithVeto = "legislativeSession_sessionEndedWithVeto",
  presidentialPower_policyPeek = "presidentialPower_policyPeek",
  presidentialPower_investigateLoyalty = "presidentialPower_investigateLoyalty",
  presidentialPower_callSpecialElection = "presidentialPower_callSpecialElection",
  presidentialPower_execution = "presidentialPower_execution",
  gameEnded_liberal = "gameEnded_liberal",
  gameEnded_fascist = "gameEnded_fascist",
}

export const GameVisibility: any = {
  PRIVATE: "private",
  PUBLIC: "public",
} as const
export type GameVisibility = (typeof GameVisibility)[keyof typeof GameVisibility] | undefined
