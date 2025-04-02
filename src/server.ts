import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import slackRoutes from "./routes/slack";
import { deflate } from "zlib";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use("/slack", slackRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app