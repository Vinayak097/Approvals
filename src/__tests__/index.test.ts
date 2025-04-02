// src/__tests__/index.test.ts
import request from 'supertest';
import express from 'express';
import { WebClient } from '@slack/web-api';
import crypto from 'crypto';

// Mock Slack APIs
jest.mock('@slack/web-api');
jest.mock('crypto');

// Mock environment variables
process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
process.env.SLACK_BOT_TOKEN = 'test-bot-token';

describe('Slack Approval Bot', () => {
  let app: express.Application;
  
  beforeEach(() => {
    jest.resetModules();
    
    // Mock WebClient implementation
    ((WebClient as unknown) as jest.Mock).mockImplementation(() => ({
      users: {
        list: jest.fn().mockResolvedValue({
          members: [
            { id: 'U123', real_name: 'Test User', is_bot: false, deleted: false },
            { id: 'U456', real_name: 'Bot User', is_bot: true, deleted: false }
          ]
        })
      },
      views: {
        open: jest.fn().mockResolvedValue({ ok: true })
      },
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
        update: jest.fn().mockResolvedValue({ ok: true })
      }
    }));
    
    // Mock crypto for request verification
    (crypto.createHmac as jest.Mock).mockReturnValue({
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('test-signature')
    });
    
    (crypto.timingSafeEqual as jest.Mock).mockReturnValue(true);
    
    // Import the app
    app = require('../index').default;
  });
  
  describe('Health check endpoint', () => {
    it('should return 200 for the health check endpoint', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
      expect(response.text).toBe('Slack Approval Bot is running!');
    });
  });

  describe('POST /slack/commands/approval-test', () => {
    it('should open a modal when slash command is triggered', async () => {
      const response = await request(app)
        .post('/slack/commands/approval-test')
        .send({ trigger_id: 'test-trigger-id' })
        .set('x-slack-signature', 'v0=test')
        .set('x-slack-request-timestamp', Math.floor(Date.now() / 1000).toString());
      
      expect(response.status).toBe(200);
      
      const mockWebClient = ((WebClient as unknown) as jest.Mock).mock.instances[0];
      expect(mockWebClient.users.list).toHaveBeenCalled();
      expect(mockWebClient.views.open).toHaveBeenCalledWith(expect.objectContaining({
        trigger_id: 'test-trigger-id',
        view: expect.objectContaining({
          type: 'modal',
          callback_id: 'approval_request_modal'
        })
      }));
    });
  });
  
  describe('POST /slack/interactions', () => {
    it('should handle modal submission correctly', async () => {
      const payload = {
        type: 'view_submission',
        view: {
          callback_id: 'approval_request_modal',
          state: {
            values: {
              approver_block: {
                approver_select: {
                  selected_option: { value: 'U123' }
                }
              },
              approval_text_block: {
                approval_text_input: {
                  value: 'Test approval request'
                }
              }
            }
          }
        },
        user: { id: 'U456' }
      };
      
      const response = await request(app)
        .post('/slack/interactions')
        .send({ payload: JSON.stringify(payload) })
        .set('x-slack-signature', 'v0=test')
        .set('x-slack-request-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('Content-Type', 'application/x-www-form-urlencoded');
      
      expect(response.status).toBe(200);
      
      const mockWebClient = ((WebClient as unknown) as jest.Mock).mock.instances[0];
      
      // Verify messages to approver and requester
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(2);
      
      // Check approver message contains buttons
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'U123',
        blocks: expect.arrayContaining([
          expect.objectContaining({
            type: 'actions',
            elements: expect.arrayContaining([
              expect.objectContaining({ action_id: 'approve_request' }),
              expect.objectContaining({ action_id: 'reject_request' })
            ])
          })
        ])
      }));
      
      // Check requester got notification
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'U456'
      }));
    });
    
    it('should handle approval action correctly', async () => {
      const payload = {
        type: 'block_actions',
        actions: [{
          action_id: 'approve_request',
          value: JSON.stringify({ requesterId: 'U456', approvalText: 'Test request' })
        }],
        user: { id: 'U123' },
        channel: { id: 'C123' },
        message: { ts: '123456789.123456' }
      };
      
      const response = await request(app)
        .post('/slack/interactions')
        .send({ payload: JSON.stringify(payload) })
        .set('x-slack-signature', 'v0=test')
        .set('x-slack-request-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('Content-Type', 'application/x-www-form-urlencoded');
      
      expect(response.status).toBe(200);
      
      const mockWebClient = ((WebClient as unknown) as jest.Mock).mock.instances[0];
      
      // Check requester notification
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'U456',
        blocks: expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              text: expect.stringContaining('approved')
            })
          })
        ])
      }));
      
      // Check message update
      expect(mockWebClient.chat.update).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'C123',
        ts: '123456789.123456'
      }));
    });
    
    it('should handle reject action correctly', async () => {
      const payload = {
        type: 'block_actions',
        actions: [{
          action_id: 'reject_request',
          value: JSON.stringify({ requesterId: 'U456', approvalText: 'Test request' })
        }],
        user: { id: 'U123' },
        channel: { id: 'C123' },
        message: { ts: '123456789.123456' }
      };
      
      const response = await request(app)
        .post('/slack/interactions')
        .send({ payload: JSON.stringify(payload) })
        .set('x-slack-signature', 'v0=test')
        .set('x-slack-request-timestamp', Math.floor(Date.now() / 1000).toString())
        .set('Content-Type', 'application/x-www-form-urlencoded');
      
      expect(response.status).toBe(200);
      
      const mockWebClient = ((WebClient as unknown) as jest.Mock).mock.instances[0];
      
      // Check requester notification
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'U456',
        blocks: expect.arrayContaining([
          expect.objectContaining({
            text: expect.objectContaining({
              text: expect.stringContaining('rejected')
            })
          })
        ])
      }));
      
      // Check message update
      expect(mockWebClient.chat.update).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'C123',
        ts: '123456789.123456'
      }));
    });
  });
});