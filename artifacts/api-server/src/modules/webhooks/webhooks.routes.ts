import { Router, type IRouter } from "express";
import asaasRouter from "./asaas.routes.js";

const router: IRouter = Router();
router.use(asaasRouter);

export default router;
