require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

import router from "./routes/slack";
const app = express();
const PORT = 3000;



app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.use('/slack', router)

app.listen(PORT, () => {
    console.log(`🚀 Slack bot is running on port ${PORT}`);
});

export default app