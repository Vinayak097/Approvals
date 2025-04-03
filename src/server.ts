require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

import slackRouter from './routes/slack'; // Import the router

const app = express();
const PORT = 3000;



app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get('/',(req:any,res:any)=>{
    res.json({message:"hello from server"})
    return;
})
app.use('/slack', slackRouter);



app.listen(PORT, () => {
    console.log(`🚀 Slack bot is running on port ${PORT}`);
});

export default app;