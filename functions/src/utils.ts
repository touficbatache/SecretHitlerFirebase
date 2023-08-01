import { Response } from "express"
import { DocumentReference, Query } from "@google-cloud/firestore"
import { firestore } from "firebase-admin"

export function generateIdAppendedObject(doc: firestore.DocumentSnapshot) {
    const idAppendedObject: any = doc.data()
    idAppendedObject.id = doc.id
    return idAppendedObject
}

export function removeDuplicates(array: any[]) {
    return Array.from(new Set(array))
}

export function handleSuccess(res: Response, body?: any) {
    if (body != null) {
        return res.status(200).send(body)
    } else {
        return res.status(204).send()
    }
}

export function handleCreated(res: Response, body: any) {
    return res.status(201).send(body)
}

export function handleNotFoundError(res: Response) {
    return res.status(400).send({ message: "400 - Not found" })
}

export class NotFoundError extends Error {
    constructor() {
        super()
        throw new Error("Not found")
    }
}

export function handleUnauthorizedError(res: Response) {
    return res.status(401).send({ message: "401 - Unauthorized" })
}

export class UnauthorizedError extends Error {
    constructor() {
        super()
        throw new Error("Not found")
    }
}

export function handleForbiddenError(res: Response) {
    return res.status(403).send({ message: "403 - Forbidden" })
}

export function handleAlreadyExistsError(res: Response) {
    return res.status(409).send({ message: "409 - Already exists" })
}

export function handleMissingFields(res: Response) {
    return res.status(422).send({ message: "422 - Missing fields" })
}

export function handleGameNotFound(res: Response) {
    return res.status(452).send({ message: "452 - Game not found" })
}

export function handlePlayerAlreadyInGame(res: Response) {
    return res.status(453).send({ message: "453 - Player already in game" })
}

export function handlePlayerNotInGame(res: Response) {
    return res.status(454).send({ message: "454 - Player not in game" })
}

export function handleNotEnoughPlayersError(res: Response) {
    return res.status(455).send({ message: "455 - Not enough players" })
}

export function handleGameStartedError(res: Response) {
    return res.status(456).send({ message: "456 - Game has already started" })
}

export function handleGameProgressTamperingError(res: Response) {
    return res.status(457).send({ message: "457 - Game progress can't be tampered with" })
}

export function handleIneligiblePlayerError(res: Response) {
    return res.status(458).send({ message: "458 - Player is ineligible" })
}

export function handleInternalError(res: Response, err: any) {
    return res.status(500).send({ message: `${err.code} - ${err.message}` })
}

export function handleInternalErrorWithMessage(res: Response, message: string) {
    return res.status(500).send({ message: `500 - ${message}` })
}

export function handleUnexpectedInternalError(res: Response) {
    return res.status(500).send({ message: `500 - Something unexpectedly went wrong` })
}

///////////////////////////////

declare module "@google-cloud/firestore" {
    export interface Query<T> {
        getSerialized(): Promise<any[]>;
    }
}

Query.prototype.getSerialized = async function () {
    const objects: any[] = []

    const snapshot: firestore.QuerySnapshot = await this.get()
    snapshot.forEach((object: firestore.QueryDocumentSnapshot) => objects.push(generateIdAppendedObject(object)))

    return objects
}

declare module "@google-cloud/firestore" {
    export interface DocumentReference<T> {
        getSerialized(): Promise<any>;
    }
}

DocumentReference.prototype.getSerialized = async function () {
    const snapshot: firestore.DocumentSnapshot = await this.get()
    if (!snapshot.exists) {
        throw NotFoundError
    }
    return generateIdAppendedObject(snapshot)
}

export function shuffle(array: any[]) {
    array.sort(() => Math.random() - 0.5)
}

export function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
}
