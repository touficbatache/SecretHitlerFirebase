import { Response } from "express"

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

///////////////////////////////

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve: () => void) => setTimeout(resolve, ms))
}
