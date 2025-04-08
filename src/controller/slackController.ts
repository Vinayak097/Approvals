import { Request, Response } from "express";
import { WebClient } from "@slack/web-api";


const slackToken = process.env.SLACK_BOT_TOKEN!;
const slackClient = new WebClient(slackToken);

export const handleSlashCommand =  async (req:Request, res:Response) => {
    const { command, trigger_id } = req.body;
    
    if (command === '/approval-test') {
        try {
            await slackClient.views.open({
                trigger_id,
                view: {
                    type: "modal",
                    callback_id: "approval_modal",
                    title: { type: "plain_text", text: "Approval Request" },
                    blocks: [
                        {
                            type: "section",
                            block_id: "approver_section",
                            text: {
                                type: "mrkdwn",
                                text: "Select an approver from your workspace:"
                            },
                            accessory: {
                                type: "users_select",
                                action_id: "approver_select",
                                placeholder: {
                                    type: "plain_text",
                                    text: "Select an approver"
                                }
                            }
                        },
                        {
                            type: "input",
                            block_id: "request_input",
                            element: {
                                type: "plain_text_input",
                                action_id: "request_text",
                                multiline: true,
                                placeholder: {
                                    type: "plain_text",
                                    text: "Enter your approval request details"
                                }
                            },
                            label: {
                                type: "plain_text",
                                text: "Approval Request Details"
                            }
                        }
                    ],
                    submit: { 
                        type: "plain_text", 
                        text: "Submit Request",
                        emoji: true
                    },
                    close: {
                        type: "plain_text",
                        text: "Cancel",
                        emoji: true
                    }
                }
            });

            return res.send(); // Empty response to acknowledge the request
        } catch (error) {
            console.error("Error opening modal:", error);
            return res.status(500).send("Error opening modal");
        }
    }
    
    res.status(400).send('Invalid command');
}
export const handleInteraction = async (req:Request, res:Response) => {
    const payload = JSON.parse(req.body?.payload);
    
    // Handle view submission (modal submit)
    if (payload.type === "view_submission") {
        try {
            const approverId = payload.view.state.values.approver_section.approver_select.selected_user;
            const requestText = payload.view.state.values.request_input.request_text.value;
            const requesterId = payload.user.id;
            
            if (!approverId || !requestText) {
                return res.status(400).json({
                    response_action: "errors",
                    errors: {
                        approver_section: approverId ? undefined : "Please select an approver",
                        request_input: requestText ? undefined : "Please enter request details"
                    }
                });
            }

            // Send approval request to the selected approver
            await slackClient.chat.postMessage({
                channel: approverId,
                text: `New approval request from <@${requesterId}>`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Approval Request*\n\n<@${requesterId}> is requesting approval for:\n\n${requestText}`
                        }
                    },
                    {
                        type: "actions",
                        elements: [
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Approve ✅",
                                    emoji: true
                                },
                                style: "primary",
                                value: "approve",
                                action_id: "approve_action"
                            },
                            {
                                type: "button",
                                text: {
                                    type: "plain_text",
                                    text: "Reject ❌",
                                    emoji: true
                                },
                                style: "danger",
                                value: "reject",
                                action_id: "reject_action"
                            }
                        ]
                    }
                ]
            });

            // Send confirmation to requester
            await slackClient.chat.postMessage({
                channel: requesterId,
                text: `Your approval request has been sent to <@${approverId}>`
            });

            return res.send(); // Acknowledge the submission
        } catch (error) {
            console.error("Error handling view submission:", error);
            return res.status(500).send("Error processing request");
        }
    }
    
    // Handle button actions (approve/reject)
    if (payload.type === "block_actions") {
        try {
            const action = payload.actions[0];
            const approverId = payload.user.id;
            const messageText = payload.message.text;
            
            // Extract requester ID from the message text
            const requesterMatch = messageText.match(/<@(.*?)>/);
            if (!requesterMatch) {
                throw new Error("Could not find requester in message");
            }
            const requesterId = requesterMatch[1];
            
            // Determine action and response
            const isApproved = action.value === "approve";
            const statusText = isApproved ? "approved" : "rejected";
            const statusEmoji = isApproved ? "✅" : "❌";
            
            // Notify requester
            await slackClient.chat.postMessage({
                channel: requesterId,
                text: `Your approval request has been ${statusText} by <@${approverId}> ${statusEmoji}`
            });
            
            // Update the original approval message
            await slackClient.chat.update({
                channel: payload.channel.id,
                ts: payload.message.ts,
                text: `Approval request ${statusText} by <@${approverId}>`,
                blocks: [
                    {
                        type: "section",
                        text: {
                            type: "mrkdwn",
                            text: `*Approval Request*\n\nThis request has been ${statusText} by <@${approverId}> ${statusEmoji}`
                        }
                    }
                ]
            });
            
            return res.send(); // Acknowledge the action
        } catch (error) {
            console.error("Error handling block action:", error);
            return res.status(500).send("Error processing action");
        }
    }
    
    // URL verification for Slack Events API
    if (payload.type === "url_verification") {
        return res.status(200).json({ challenge: payload.challenge });
    }
    
    console.warn("Unhandled interaction type:", payload.type);
    res.status(400).send("Unhandled interaction type");
}


export const checkbotworking=async (req:Request, res:Response) => {
  const { command, user_id } = req.body;

  if (command === '/checkbotworking') {
   
      return res.json({
          response_type: "in_channel",
          text: "✅ Bot is working!",
      });
  }

  res.status(400).send('Invalid command');
}

export const enventSubscription=async(req: Request, res: Response) => {
        const { type, challenge, event } = req.body;
      
        // Slack URL verification
        if (type === 'url_verification') {
            console.log("challege")
          return res.json({ challenge });
        }
      
        // Handle different event types
        if (event && event.type === 'app_mention') {
          console.log(`📢 Bot mentioned in ${event.channel}: ${event.text}`);
        } else if (event && event.type === 'message') {
          console.log(`💬 New message in ${event.channel}: ${event.text}`);
        }
      
        res.sendStatus(200);
}
