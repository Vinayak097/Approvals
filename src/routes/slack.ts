import express from "express";
import { checkbotworking, enventSubscription, handleInteraction, handleSlashCommand } from "../controller/slackController";

import { Request,Response } from "express";
const router = express.Router();

//health check
router.post('/bot/check', checkbotworking);

// Slash command handler
router.post('/command', handleSlashCommand);

// Interactions handler
router.post("/interactions", handleInteraction);

router.post('/events',enventSubscription)

export default router;
