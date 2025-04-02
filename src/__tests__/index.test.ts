// src/__tests__/index.test.ts
import request from 'supertest';
import express from 'express';
import { WebClient } from '@slack/web-api';
import { createEventAdapter } from '@slack/events-api';
import { createMessageAdapter } from '@slack/interactive-messages';

// Mock Slack APIs
jest.mock('@slack/web-api');
jest.mock('@slack/events-api');
jest.mock('@slack/interactive-messages');

// Mock environment variables
process.env.SLACK_SIGNING_SECRET = 'test-signing-secret';
process.env.SLACK_BOT_TOKEN = 'test-bot-token';

describe('Slack Approval Bot', () => {
  let app: express.Application;
  
  beforeEach(() => {
    jest.resetModules();
    
    // Mock implementations
    (WebClient as jest.Mock).mockImplementation(() => ({
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
    
    (createEventAdapter as jest.Mock).mockReturnValue({
      requestListener: jest.fn().mockReturnValue((req: any, res: any, next: any) => next())
    });
    
    (createMessageAdapter as jest.Mock).mockReturnValue({
      requestListener: jest.fn().mockReturnValue((req: any, res: any, next: any) => next()),
      action: jest.fn(),
      viewSubmission: jest.fn()
    });
    
    // Import the app
    app = require('../index').default;
  });
  
  describe('POST /slack/commands/approval-test', () => {
    it('should open a modal when slash command is triggered', async () => {
      const response = await request(app)
        .post('/slack/commands/approval-test')
        .send({ trigger_id: 'test-trigger-id' })
        .set('Content-Type', 'application/json');
      
      expect(response.status).toBe(200);
      
      const mockWebClient = (WebClient as jest.Mock).mock.instances[0];
      expect(mockWebClient.users.list).toHaveBeenCalled();
      expect(mockWebClient.views.open).toHaveBeenCalledWith(expect.objectContaining({
        trigger_id: 'test-trigger-id',
        view: expect.objectContaining({
          type: 'modal',
          callback_id: 'approval_request_modal'
        })
      }));
    });
    
    it('should handle errors gracefully', async () => {
      // Make the view.open method throw an error
      const mockWebClient = (WebClient as jest.Mock).mock.instances[0];
      mockWebClient.views.open.mockRejectedValueOnce(new Error('Test error'));
      
      const response = await request(app)
        .post('/slack/commands/approval-test')
        .send({ trigger_id: 'test-trigger-id' })
        .set('Content-Type', 'application/json');
      
      expect(response.status).toBe(500);
      expect(response.text).toContain('An error occurred');
    });
  });
  
  describe('View submission handler', () => {
    it('should send messages to approver and requester', async () => {
      // Get the viewSubmission handler
      const mockInteractions = (createMessageAdapter as jest.Mock).mock.results[0].value;
      const viewSubmissionCallback = mockInteractions.viewSubmission.mock.calls[0][1];
      
      // Mock payload
      const mockPayload = {
        view: {
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
      
      // Call the handler
      const result = await viewSubmissionCallback(mockPayload);
      
      // Check result
      expect(result).toEqual({ response_action: 'clear' });
      
      // Verify messages were sent
      const mockWebClient = (WebClient as jest.Mock).mock.instances[0];
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledTimes(2);
      
      // Check approver message
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
      
      // Check requester message
      expect(mockWebClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'U456'
      }));
    });
  });
  
  describe('Action handlers', () => {
    let approveMockPayload: any;
    let rejectMockPayload: any;
    
    beforeEach(() => {
      // Common payload structure
      const basePayload = {
        actions: [{ value: JSON.stringify({ requesterId: 'U456', approvalText: 'Test request' }) }],
        user: { id: 'U123' },
        channel: { id: 'C123' },
        message: { ts: '123456789.123456' }
      };
      
      approveMockPayload = { ...basePayload };
      rejectMockPayload = { ...basePayload };
    });
    
    it('should handle approval action', async () => {
      // Get the action handler
      const mockInteractions = (createMessageAdapter as jest.Mock).mock.results[0].value;
      const approveCallback = mockInteractions.action.mock.calls.find(
        call => call[0] === 'approve_request'
      )[1];
      
      // Call the handler
      const result = await approveCallback(approveMockPayload);
      
      // Check result
      expect(result).toEqual({ text: 'Processing approval...' });
      
      // Verify messages were sent
      const mockWebClient = (WebClient as jest.Mock).mock.instances[0];
      
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
      
      // Check approver message update
      expect(mockWebClient.chat.update).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'C123',
        ts: '123456789.123456'
      }));
    });
    
    it('should handle rejection action', async () => {
      // Get the action handler
      const mockInteractions = (createMessageAdapter as jest.Mock).mock.results[0].value;
      const rejectCallback = mockInteractions.action.mock.calls.find(
        call => call[0] === 'reject_request'
      )[1];
      
      // Call the handler
      const result = await rejectCallback(rejectMockPayload);
      
      // Check result
      expect(result).toEqual({ text: 'Processing rejection...' });
      
      // Verify messages were sent
      const mockWebClient = (WebClient as jest.Mock).mock.instances[0];
      
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
      
      // Check approver message update
      expect(mockWebClient.chat.update).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'C123',
        ts: '123456789.123456'
      }));
    });
  });
});