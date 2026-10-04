import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { paramString } from '../param-string.js';

describe('Express route param array rejection', () => {
  it('should extract string param when it is a single string value', () => {
    const mockReq = {
      params: {
        testId: 'value-123'
      }
    } as unknown as Request;

    const testId = paramString(mockReq.params.testId);
    expect(testId).toBe('value-123');
  });

  it('should return undefined when param is an array (wildcard route scenario)', () => {
    // Simulate Express 5 behavior with wildcard params where the param becomes an array
    const mockReq = {
      params: {
        testId: ['value1', 'value2'] // This is what Express 5 does with wildcard params
      }
    } as unknown as Request;

    const testId = paramString(mockReq.params.testId);
    expect(testId).toBeUndefined();
  });

  it('route handler should reject array params with 400 error', () => {
    // Simulate a route handler that uses paramString for validation
    const routeHandler = (req: Request, res: Response) => {
      const testId = paramString(req.params.testId);
      if (!testId) {
        res.status(400).json({ error: 'Invalid test ID' });
        return;
      }
      res.status(200).json({ id: testId });
    };

    const responses: any[] = [];
    const mockRes = {
      status: (code: number) => {
        const response = {
          code,
          json: (data: any) => {
            responses.push({ status: code, data });
            return response;
          }
        };
        return response;
      },
      json: (data: any) => {
        responses.push(data);
      }
    } as unknown as Response;

    // Test with array param
    const mockReqWithArray = {
      params: {
        testId: ['value1', 'value2']
      }
    } as unknown as Request;

    routeHandler(mockReqWithArray, mockRes);

    expect(responses).toHaveLength(1);
    expect(responses[0].status).toBe(400);
    expect(responses[0].data.error).toBe('Invalid test ID');
  });
});
