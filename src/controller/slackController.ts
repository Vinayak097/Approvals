import { Request, Response } from "express";
import { WebClient } from "@slack/web-api";
import { ViewsOpenArguments, ModalView } from '@slack/web-api';

const slackToken = process.env.SLACK_BOT_TOKEN!;
const slackClient = new WebClient(slackToken);

export const handleSlashCommand = async (req: Request, res: Response) => {
  const { trigger_id } = req.body;

  const modal: ViewsOpenArguments = {
    trigger_id: "your-trigger-id", // Replace with actual trigger ID
    view: {
      type: "modal",
      callback_id: "your-callback-id", // Replace with your callback ID
      title: {
        type: "plain_text", // This must be "plain_text" not just string
        text: "Your Modal Title"
      },
      blocks: [
        {
          type: "input", // Use specific block types like "input", "section", etc.
          block_id: "block_1",
          label: {
            type: "plain_text", // This must be "plain_text"
            text: "Label Text"
          },
          element: {
            type: "plain_text_input", // Use specific element types
            action_id: "input_action"
          }
        }
      ],
      submit: {
        type: "plain_text",
        text: "Submit"
      }
    }
  };
  await slackClient.views.open(modal);
  res.status(200).send();
};
export const handleInteraction = async (req: Request, res: Response) => {
  const payload = JSON.parse(req.body.payload);
  
  if (payload.type === "view_submission") {
    const approverId = payload.view.state.values.approver.approver_select.selected_user;
    const approvalText = payload.view.state.values.approval_text.text_input.value;
    const requesterId = payload.user.id;

    await slackClient.chat.postMessage({
      channel: approverId,
      text: `Approval Request: "${approvalText}"`,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Approval Request from <@${requesterId}>:* \n"${approvalText}"` },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "Approve" },
              style: "primary",
              value: JSON.stringify({ requesterId, approvalText }),
              action_id: "approve_request",
            },
            {
              type: "button",
              text: { type: "plain_text", text: "Reject" },
              style: "danger",
              value: JSON.stringify({ requesterId, approvalText }),
              action_id: "reject_request",
            },
          ],
        },
      ],
    });

    res.status(200).send();
  } else if (payload.type === "block_actions") {
    const action = payload.actions[0];
    const { requesterId, approvalText } = JSON.parse(action.value);

    const decision = action.action_id === "approve_request" ? "Approved ✅" : "Rejected ❌";

    await slackClient.chat.postMessage({
      channel: requesterId,
      text: `Your request was *${decision}* by <@${payload.user.id}>.`,
    });

    res.status(200).send();
  }
};
