// src/index.ts
import express from 'express';
import { WebClient } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';
import { createMessageAdapter } from '@slack/interactive-messages';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// Initialize Slack clients
const slackEvents = createEventAdapter(process.env.SLACK_SIGNING_SECRET as string);
const slackInteractions = createMessageAdapter(process.env.SLACK_SIGNING_SECRET as string);
const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

// Middleware configuration
app.use(express.json());
app.use('/slack/events', slackEvents.requestListener());
app.use('/slack/interactions', slackInteractions.requestListener());

/**
 * Handle the /approval-test slash command
 * Opens a modal for the user to submit an approval request
 */
// Add this to your src/index.ts file
app.get('/', (req, res) => {
  res.status(200).send('Slack Approval Bot is running!');
});
app.post('/slack/commands/approval-test', async (req, res) => {
  console.log('Received slash command request:', JSON.stringify(req.body));
  
  try {
    // Extract trigger_id from the slash command request
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

    // Open a modal dialog
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

    // Acknowledge the command request
    return res.status(200).send();
  } catch (error) {
    console.error('Error handling slash command:', error);
    return res.status(500).send('An error occurred while processing your request.');
  }
});
/**
 * Handle modal submission
 * Sends the approval request to the selected approver
 */
slackInteractions.viewSubmission('approval_request_modal', async (payload) => {
  try {
    // Extract form values
    const { values } = payload.view.state;
    const approverId = values.approver_block.approver_select.selected_option.value;
    const approvalText = values.approval_text_block.approval_text_input.value;
    const requesterId = payload.user.id;

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

    // Close the modal
    return {
      response_action: 'clear',
    };
  } catch (error) {
    console.error('Error handling modal submission:', error);
    return {
      response_action: 'errors',
      errors: {
        approver_block: 'Failed to process your request. Please try again.',
      },
    };
  }
});

/**
 * Handle the approval button click
 */
slackInteractions.action('approve_request', async (payload) => {
  try {
    // Extract action value
    const { requesterId, approvalText } = JSON.parse(payload.actions[0].value);
    const approverId = payload.user.id;

    // Notify requester of approval
    await slackClient.chat.postMessage({
      channel: requesterId,
      text: `Your approval request has been approved by <@${approverId}>`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:white_check_mark: Your approval request has been *approved* by <@${approverId}>:`,
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

    // Update the original message to approver
    await slackClient.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: `Approval request from <@${requesterId}> (Approved)`,
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
              text: `:white_check_mark: You *approved* this request.`,
            },
          ],
        },
      ],
    });

    return {
      text: 'Processing approval...',
    };
  } catch (error) {
    console.error('Error handling approval action:', error);
    return {
      text: 'Failed to process approval. Please try again.',
    };
  }
});

/**
 * Handle the reject button click
 */
slackInteractions.action('reject_request', async (payload) => {
  try {
    // Extract action value
    const { requesterId, approvalText } = JSON.parse(payload.actions[0].value);
    const approverId = payload.user.id;

    // Notify requester of rejection
    await slackClient.chat.postMessage({
      channel: requesterId,
      text: `Your approval request has been rejected by <@${approverId}>`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:x: Your approval request has been *rejected* by <@${approverId}>:`,
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

    // Update the original message to approver
    await slackClient.chat.update({
      channel: payload.channel.id,
      ts: payload.message.ts,
      text: `Approval request from <@${requesterId}> (Rejected)`,
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
              text: `:x: You *rejected* this request.`,
            },
          ],
        },
      ],
    });

    return {
      text: 'Processing rejection...',
    };
  } catch (error) {
    console.error('Error handling rejection action:', error);
    return {
      text: 'Failed to process rejection. Please try again.',
    };
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});