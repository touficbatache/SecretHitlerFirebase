import { hitlerKnowsFascists, teamOf } from "./rules"
import {
  GameState,
  HistoryEntry,
  Phase,
  Player,
  Policy,
  PolicyCounts,
  Power,
  Role,
  Session,
  Team,
  Transition,
} from "./types"

export interface PlayerInfo {
  id: string
  isAlive: boolean
  /** Only when the viewer may know it: their own, their fellow fascists', or once the game ends. */
  role?: Role
  /** Known without the role: a player the viewer investigated. */
  team?: Team
}

/** A government's turn, without anything secret: the policies in hand stay hidden. */
export interface PublicSession {
  presidentId: string
  isSpecialElection: boolean
  chancellorId?: string
  /** Who voted Ja or Nein, once everyone has voted. */
  votes?: Record<string, boolean>
  /** Who has voted so far, while the vote is on. */
  voted: string[]
  passed?: boolean
  vetoRefused?: boolean
  enactedPolicy?: Policy
  power?: Power
  investigatedId?: string
  specialElectionPresidentId?: string
  executedId?: string
}

export type PublicHistoryEntry = PublicSession | { chaos: true; enactedPolicy: Policy }

export interface PlayerView {
  /** The viewer, or undefined for a spectator. */
  you: { id: string; role: Role; team: Team } | undefined
  players: PlayerInfo[]
  phase: Phase
  next: Transition | undefined
  board: PolicyCounts
  electionTracker: number
  powers: Partial<Record<number, Power>>
  termLimits: { presidentId?: string; chancellorId?: string }
  drawPileCount: number
  discardPileCount: number
  session: PublicSession | undefined
  history: PublicHistoryEntry[]
  /** The policies the viewer holds right now, as President or Chancellor. */
  hand?: Policy[]
  /** What the viewer's policy peek showed, while the power is on. */
  peekedPolicies?: Policy[]
}

/**
 * What one player may see of the game, following the rules: their own role, their fellow
 * fascists (Hitler too, in 5 and 6 player games), the result of their own investigations and
 * the policies in their own hand. The draw pile's order, other players' hands and the votes
 * before everyone has voted stay hidden. Pass an id that isn't a player for a spectator's view.
 */
export function viewFor(state: GameState, viewerId: string): PlayerView {
  const viewer: Player | undefined = state.players.find((p: Player) => p.id === viewerId)
  const isOver: boolean = state.phase.name === "gameOver"
  const investigatedByViewer: Set<string> = new Set(
    sessionsOf(state)
      .filter((s: Session) => s.presidentId === viewerId && s.investigatedId !== undefined)
      .map((s: Session) => s.investigatedId as string),
  )

  const players: PlayerInfo[] = state.players.map((player: Player) => {
    const info: PlayerInfo = { id: player.id, isAlive: player.isAlive }
    if (isOver || (viewer !== undefined && knowsRole(state, viewer, player))) {
      info.role = player.role
    } else if (investigatedByViewer.has(player.id)) {
      info.team = teamOf(player.role)
    }
    return info
  })

  const view: PlayerView = {
    you:
      viewer === undefined
        ? undefined
        : { id: viewer.id, role: viewer.role, team: teamOf(viewer.role) },
    players,
    phase: state.phase,
    next: state.next,
    board: { ...state.board },
    electionTracker: state.electionTracker,
    powers: { ...state.powers },
    termLimits: { ...state.termLimits },
    drawPileCount: state.drawPile.length,
    discardPileCount: state.discardPile.liberal + state.discardPile.fascist,
    session:
      state.session === undefined ? undefined : publicSession(state.session, isVoteOpen(state)),
    history: state.history.map((entry: HistoryEntry) =>
      "chaos" in entry ? { ...entry } : publicSession(entry, false),
    ),
  }

  const hand: Policy[] | undefined = handOf(state, viewerId)
  if (hand !== undefined) view.hand = [...hand]

  const session: Session | undefined = state.session
  if (
    session?.peekedPolicies !== undefined &&
    session.presidentId === viewerId &&
    state.phase.name === "power" &&
    !state.phase.done
  ) {
    view.peekedPolicies = [...session.peekedPolicies]
  }

  return view
}

function knowsRole(state: GameState, viewer: Player, player: Player): boolean {
  if (viewer.id === player.id) return true
  if (viewer.role === "fascist") return player.role !== "liberal"
  if (viewer.role === "hitler" && hitlerKnowsFascists(state.players.length)) {
    return player.role === "fascist"
  }
  return false
}

function isVoteOpen(state: GameState): boolean {
  return state.phase.name === "voting"
}

function publicSession(session: Session, voteOpen: boolean): PublicSession {
  const view: PublicSession = {
    presidentId: session.presidentId,
    isSpecialElection: session.isSpecialElection,
    voted: Object.keys(session.votes),
  }
  if (session.chancellorId !== undefined) view.chancellorId = session.chancellorId
  if (!voteOpen && Object.keys(session.votes).length > 0) view.votes = { ...session.votes }
  if (session.passed !== undefined) view.passed = session.passed
  if (session.vetoRefused !== undefined) view.vetoRefused = session.vetoRefused
  if (session.enactedPolicy !== undefined) view.enactedPolicy = session.enactedPolicy
  if (session.power !== undefined) view.power = session.power
  if (session.investigatedId !== undefined) view.investigatedId = session.investigatedId
  if (session.specialElectionPresidentId !== undefined) {
    view.specialElectionPresidentId = session.specialElectionPresidentId
  }
  if (session.executedId !== undefined) view.executedId = session.executedId
  return view
}

function handOf(state: GameState, viewerId: string): Policy[] | undefined {
  const session: Session | undefined = state.session
  if (session === undefined) return undefined
  switch (state.phase.name) {
    case "presidentDiscard":
      return session.presidentId === viewerId ? session.presidentPolicies : undefined
    case "chancellorDiscard":
    case "vetoRequested":
      return session.chancellorId === viewerId ? session.chancellorPolicies : undefined
    default:
      return undefined
  }
}

function sessionsOf(state: GameState): Session[] {
  const sessions: Session[] = state.history.filter(
    (entry: HistoryEntry): entry is Session => !("chaos" in entry),
  )
  if (state.session !== undefined) sessions.push(state.session)
  return sessions
}
