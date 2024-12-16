import { Request, Response } from "express"
import { NextFunction } from "express-serve-static-core"

import { handleForbiddenError } from "../utils"

export function isAuthorized(opts: {
  hasRole: Array<"admin" | "manager" | "user" | "driver">
  allowSameUser?: boolean
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { role, uid } = res.locals
    const { id } = req.params

    if (opts.allowSameUser && id && uid === id) return next()

    if (!role) return handleForbiddenError(res)

    if (opts.hasRole.includes(role)) return next()

    return handleForbiddenError(res)
  }
}
