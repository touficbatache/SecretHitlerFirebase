export enum ChamberStatus { waiting, settingUp, election, legislativeSession, presidentialPower, gameEnded }

export enum ChamberSubStatus {
    election_presidentChoosingChancellor,
    election_voting,
    election_votingEnded,
    legislativeSession_presidentDiscardingPolicy,
    legislativeSession_chancellorDiscardingPolicy,
    legislativeSession_sessionEndedWithPolicyEnactment,
    legislativeSession_chancellorSeekingVeto,
    legislativeSession_sessionEndedWithVeto,
    presidentialPower_policyPeek,
    presidentialPower_investigateLoyalty,
    presidentialPower_callSpecialElection,
    presidentialPower_execution,
    gameEnded_liberal,
    gameEnded_fascist
}

export enum GameType { fiveSix, sevenEight, nineTen }

export const Policy: any = {
    LIBERAL: "liberal",
    FASCIST: "fascist",
} as const
export type Policy = typeof Policy[keyof typeof Policy]

export const ExecutiveAction: any = {
    POLICY_PEEK: "policyPeek",
    INVESTIGATE_LOYALTY: "investigateLoyalty",
    CALL_SPECIAL_ELECTION: "callSpecialElection",
    EXECUTION: "execution",
} as const
export type ExecutiveAction = typeof ExecutiveAction[keyof typeof ExecutiveAction]

export enum PlayerRole { liberal, fascist, hitler }

export enum PlayerMembership { liberal, fascist }

export enum AssetReference {
    liberal_1,
    liberal_2,
    liberal_3,
    liberal_4,
    liberal_5,
    liberal_6,
    fascist_frog,
    fascist_lizard,
    fascist_snake,
    hitler
}

export class PlayerGeneratedRoleHolder {
    constructor(readonly role: PlayerRole, readonly assetReference: AssetReference) {
    }
}

export const PresidentialPower: any = {
    CONSUMED: "consumed",
    DONE: "done",
} as const
export type PresidentialPower = typeof PresidentialPower[keyof typeof PresidentialPower]