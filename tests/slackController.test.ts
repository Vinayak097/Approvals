import request from "supertest";
import app from '../src/server'

describe("Slack Bot API", () => {
  it("should open a modal on /commands", async () => {
    const res = await request(app).post("/slack/commands").send({ trigger_id: "test" });
    expect(res.status).toBe(200);
  });

  it("should handle an approval request", async () => {
    const res = await request(app).post("/slack/interactions").send({
      payload: JSON.stringify({
        type: "view_submission",
        user: { id: "U123" },
        view: { state: { values: { approver: { approver_select: { selected_user: "U456" } }, approval_text: { text_input: { value: "Test approval" } } } } },
      }),
    });
    expect(res.status).toBe(200);
  });
});
