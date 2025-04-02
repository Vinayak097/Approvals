import express from "express";
import { handleSlashCommand, handleInteraction } from "../controllers/slackController";

const router = express.Router();

router.post("/commands", handleSlashCommand);
router.post("/interactions", handleInteraction);

export default router;
