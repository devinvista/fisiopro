import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * asyncHandler — adaptador para handlers async do Express.
 *
 * Antes:
 *   router.get("/x", async (req, res) => {
 *     try { ... } catch (err) { console.error(err); res.status(500).json({ error: "Internal Server Error" }); }
 *   });
 *
 * Depois:
 *   router.get("/x", asyncHandler(async (req, res) => {
 *     ...
 *     if (!record) throw HttpError.notFound("Registro não encontrado");
 *     res.json(record);
 *   }));
 *
 * Qualquer Promise rejeitada (incluindo HttpError, ZodError, erros do Drizzle)
 * é encaminhada ao middleware central via `next(err)`.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as Req, res, next)).catch(next);
  };
}
