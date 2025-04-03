import request from "supertest";
import app from "../src/server";
import { WebClient } from "@slack/web-api";

jest.mock("@slack/web-api", () => {
  return {
    WebClient: jest.fn().mockImplementation(() => ({
      views: { open: jest.fn().mockResolvedValue({}) },
      chat: {
        postMessage: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    })),
  };
});

describe("Slack Bot API Tests", () => {
  test("POST /slack/bot/check - should return bot is working message", async () => {
    const response = await request(app)
      .post("/slack/bot/check")
      .send({ command: "/checkbotworking", user_id: "U123456" });
    console.log('rsponse check bot ' ,response)
    expect(response.status).toBe(200);
    expect(response.body.response_type).toBe("in_channel");
    expect(response.body.text).toBe("✅ Bot is working!");
  });

  test("POST /slack/command - should open approval modal", async () => {
    const response = await request(app)
      .post("/slack/command")
      .send({ command: "/approval-test", trigger_id: "12345" });

    expect(response.status).toBe(200);
  });

  test("POST /slack/interactions - should process modal submission", async () => {
    const response = await request(app)
      .post("/slack/interactions")
      .send({
        payload: JSON.stringify({
          type: "view_submission",
          view: {
            state: {
              values: {
                approver_section: { approver_select: { selected_user: "U987654" } },
                request_input: { request_text: { value: "Test approval request" } },
              },
            },
          },
          user: { id: "U123456" },
        }),
      });

    expect(response.status).toBe(200);
  });

  test("POST /slack/interactions - should return validation error if missing data", async () => {
    const response = await request(app)
      .post("/slack/interactions")
      .send({
        payload: JSON.stringify({
          type: "view_submission",
          view: {
            state: {
              values: {
                approver_section: { approver_select: { selected_user: "" } },
                request_input: { request_text: { value: "" } },
              },
            },
          },
          user: { id: "U123456" },
        }),
      });

    expect(response.status).toBe(400);
  });

  test("POST /slack/interactions - should handle Approve action", async () => {
    const response = await request(app)
      .post("/slack/interactions")
      .send({
        payload: JSON.stringify({
          type: "block_actions",
          actions: [{ value: "approve" }],
          user: { id: "U987654" },
          message: { text: "<@U123456> requested approval" },
          channel: { id: "C123456" },
          
        }),
      });

    expect(response.status).toBe(200);
  });

  test("POST /slack/actions - should handle Reject action", async () => {
    const response = await request(app)
      .post("/slack/interactions")
      .send({
        payload: JSON.stringify({
          type: "block_actions",
          actions: [{ value: "reject" }],
          user: { id: "U987654" },
          message: { text: "<@U123456> requested approval" },
          channel: { id: "C123456" },
          
        }),
      });

    expect(response.status).toBe(200);
  });
});
