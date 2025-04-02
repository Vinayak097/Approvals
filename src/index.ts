// src/index.ts
import express from 'express';
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize Slack Web Client
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// Middleware for parsing request bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Middleware for verifying Slack requests
const verifySlackRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!slackSigningSecret) {
    console.error('SLACK_SIGNING_SECRET is not defined');
    return res.status(500).send('Server configuration error');
  }

  // Skip verification for GET requests (helpful for diagnostics)
  if (req.method === 'GET') {
    return next();
  }

  try {
    const slackSignature = req.headers['x-slack-signature'] as string;
    const requestTimestamp = req.headers['x-slack-request-timestamp'] as string;
    
    if (!slackSignature || !requestTimestamp) {
      console.error('Missing Slack signature or timestamp headers');
      return res.status(400).send('Missing verification headers');
    }
    
    // Check if the request is older than 5 minutes
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
    if (parseInt(requestTimestamp) < fiveMinutesAgo) {
      console.error('Request timestamp is too old');
      return res.status(400).send('Request timestamp is too old');
    }
    
    // Get raw body for verification
    let rawBody = '';
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (req.body instanceof Buffer) {
      rawBody = req.body.toString();
    } else {
      rawBody = new URLSearchParams(req.body).toString();
    }
    
    // Create the signature base string
    const sigBasestring = 'v0:' + requestTimestamp + ':' + rawBody;
    
    // Create the signature to compare
    const mySignature = 'v0=' + 
      crypto.createHmac('sha256', slackSigningSecret)
            .update(sigBasestring, 'utf8')
            .digest('hex');
    
    // Compare the signatures
    if (crypto.timingSafeEqual(
      Buffer.from(mySignature, 'utf8'),
      Buffer.from(slackSignature, 'utf8')
    )) {
      // If signatures match, proceed
      return next();
    } else {
      console.error('Signature verification failed');
      return res.status(400).send('Verification failed');
    }
  } catch (error) {
    console.error('Error verifying Slack request:', error);
    // For security reasons, don't expose details of the verification failure
    return res.status(400).send('Verification failed');
  }
};

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Slack Approval Bot is running!');
});

// Diagnostic endpoint - minimal functionality to test connectivity
app.post('/slack/diagnostic', verifySlackRequest, (req, res) => {
  console.log('Diagnostic endpoint hit:', req.body);
  return res.status(200).json({
    text: "Diagnostic test successful!"
  });
});

// Slash command handler
app.post('/slack/commands/approval-test', verifySlackRequest, async (req, res) => {
  console.log('Slash command received:', req.body);
  
  try {
    const { trigger_id } = req.body;
    
    // Fetch users list for the dropdown
    const usersList = await slackClient.users.list();
    const members = usersList.members?.filter(member => !member.is_bot && !member.deleted) || [];
    
    // Create options for the users dropdown
    const userOptions = members.map(member => ({
      text: {
        type: "plain_text" as const,
        text: member.real_name || member.name || 'Unknown User',
      },
      value: member.id || '',
    }));

    // Respond immediately to acknowledge receipt
    res.status(200).send();
    
    // Then open the modal
    await slackClient.views.open({
      trigger_id,
      view: {
        type: 'modal',
        callback_id: 'approval_request_modal',
        title: {
          type: 'plain_text',
          text: 'Request Approval',
        },
        submit: {
          type: 'plain_text',
          text: 'Submit',
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
        },
        blocks: [
          {
            type: 'input',
            block_id: 'approver_block',
            element: {
              type: 'static_select',
              action_id: 'approver_select',
              placeholder: {
                type: 'plain_text',
                text: 'Select an approver',
              },
              options: userOptions,
            },
            label: {
              type: 'plain_text',
              text: 'Select Approver',
            },
          },
          {
            type: 'input',
            block_id: 'approval_text_block',
            element: {
              type: 'plain_text_input',
              action_id: 'approval_text_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'What do you need approval for?',
              },
            },
            label: {
              type: 'plain_text',
              text: 'Approval Request',
            },
          },
        ],
      },
    });
  } catch (error) {
    console.error('Error handling slash command:', error);
    // The response has already been sent, so we just log the error
  }
});
// Handle interactions (button clicks, modal submissions)
app.post('/slack/interactions', verifySlackRequest, async (req, res) => {
  console.log('Interaction received');
  
  try {
    // Parse the payload
    const payload = JSON.parse(req.body.payload);
    console.log('Interaction payload type:', payload.type);
    
    // Handle different types of interactions
    if (payload.type === 'view_submission' && payload.view.callback_id === 'approval_request_modal') {
      // Modal submission
      const { values } = payload.view.state;
      const approverId = values.approver_block.approver_select.selected_option.value;
      const approvalText = values.approval_text_block.approval_text_input.value;
      const requesterId = payload.user.id;
      
      // Acknowledge the view submission
      res.status(200).send({
        response_action: 'clear'
      });
      
      // Send message to approver
      await slackClient.chat.postMessage({
        channel: approverId,
        text: `You have a new approval request from <@${requesterId}>:`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `You have a new approval request from <@${requesterId}>:`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Request:*\n${approvalText}`,
            },
          },
          {
            type: 'actions',
            block_id: 'approval_actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Approve',
                },
                style: 'primary',
                action_id: 'approve_request',
                value: JSON.stringify({ requesterId, approvalText }),
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Reject',
                },
                style: 'danger',
                action_id: 'reject_request',
                value: JSON.stringify({ requesterId, approvalText }),
              },
            ],
          },
        ],
      });
      
      // Notify requester that request has been sent
      await slackClient.chat.postMessage({
        channel: requesterId,
        text: `Your approval request has been sent to <@${approverId}>`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Your approval request has been sent to <@${approverId}>:`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Request:*\n${approvalText}`,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: 'Awaiting response...',
              },
            ],
          },
        ],
      });
      
    } else if (payload.type === 'block_actions') {
      // Button clicks
      const action = payload.actions[0];
      
      // Acknowledge the action request
      res.status(200).send();
      
      if (action.action_id === 'approve_request' || action.action_id === 'reject_request') {
        // Extract values
        const { requesterId, approvalText } = JSON.parse(action.value);
        const approverId = payload.user.id;
        const isApproved = action.action_id === 'approve_request';
        
        // Notify requester
        await slackClient.chat.postMessage({
          channel: requesterId,
          text: `Your approval request has been ${isApproved ? 'approved' : 'rejected'} by <@${approverId}>`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${isApproved ? ':white_check_mark:' : ':x:'} Your approval request has been *${isApproved ? 'approved' : 'rejected'}* by <@${approverId}>:`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Request:*\n${approvalText}`,
              },
            },
          ],
        });
        
        // Update the original message
        await slackClient.chat.update({
          channel: payload.channel.id,
          ts: payload.message.ts,
          text: `Approval request from <@${requesterId}> (${isApproved ? 'Approved' : 'Rejected'})`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `Approval request from <@${requesterId}>:`,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Request:*\n${approvalText}`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `${isApproved ? ':white_check_mark:' : ':x:'} You *${isApproved ? 'approved' : 'rejected'}* this request.`,
                },
              ],
            },
          ],
        });
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    // If we haven't sent a response yet, send one now
    if (!res.headersSent) {
      res.status(200).send({
        text: 'Error processing your request. Please try again.'
      });
    }
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Bot token present:', !!process.env.SLACK_BOT_TOKEN);
  console.log('Signing secret present:', !!process.env.SLACK_SIGNING_SECRET);
});

export default app;