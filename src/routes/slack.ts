import express from "express";
import { handleInteraction, handleSlashCommand } from "../controller/slackController";


const router = express.Router();

router.post("/commands", handleSlashCommand);
router.post("/interactions", handleInteraction);

export default router;
