import express from "express";
import { checkbotworking, handleInteraction, handleSlashCommand } from "../controller/slackController";

import { Request,Response } from "express";
const router = express.Router();

//health check
router.post('/bot/check', checkbotworking);

// Slash command handler
router.post('/command', handleSlashCommand);

// Interactions handler
router.post("/interactions", handleInteraction);


export default router;
