import script from '../src/script.mjs';

describe('Okta Create User Script', () => {
  const mockContext = {
    env: {
      ENVIRONMENT: 'test'
    },
    secrets: {
      BEARER_AUTH_TOKEN: 'test-okta-token-123456'
    },
    outputs: {}
  };

  let originalFetch;
  let originalURL;

  beforeAll(() => {
    // Save original global functions
    originalFetch = global.fetch;
    originalURL = global.URL;
  });

  beforeEach(() => {
    // Mock fetch - default behavior: GET returns 404 (user doesn't exist), POST creates user
    global.fetch = (url, options) => {
      if (options?.method === 'GET') {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({})
        });
      }

      if (options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'user123',
            status: 'ACTIVE',
            created: '2024-01-15T10:00:00.000Z',
            activated: '2024-01-15T10:00:00.000Z',
            statusChanged: '2024-01-15T10:00:00.000Z',
            lastLogin: null,
            lastUpdated: '2024-01-15T10:00:00.000Z',
            profile: {
              firstName: 'John',
              lastName: 'Doe',
              email: 'john.doe@example.com',
              login: 'john.doe@example.com'
            }
          })
        });
      }
    };

    // Mock URL constructor
    global.URL = class {
      constructor(path, base) {
        this.toString = () => `${base}${path}`;
      }
    };
  });

  afterEach(() => {
    // Restore console methods
    if (console.log.mockRestore) console.log.mockRestore();
    if (console.error.mockRestore) console.error.mockRestore();
  });

  afterAll(() => {
    // Restore original global functions
    global.fetch = originalFetch;
    global.URL = originalURL;
  });

  describe('invoke handler', () => {
    test('should successfully create user with minimal params', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.id).toBe('user123');
      expect(result.status).toBe('ACTIVE');
      expect(result.profile.email).toBe('john.doe@example.com');
      expect(result.groupIds).toEqual([]);
    });

    test('should create user with department and employee number', async () => {
      const params = {
        email: 'jane.doe@example.com',
        login: 'jane.doe@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
        department: 'Engineering',
        employeeNumber: 'EMP001',
        address: 'https://example.okta.com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.id).toBe('user123');
      expect(result.status).toBe('ACTIVE');
    });

    test('should create user with group assignments', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        groupIds: 'group1, group2, group3',
        address: 'https://example.okta.com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.groupIds).toEqual(['group1', 'group2', 'group3']);
    });

    test('should create user with additional profile attributes', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        additionalProfileAttributes: '{"mobilePhone": "555-1234", "title": "Engineer"}',
        address: 'https://example.okta.com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.id).toBe('user123');
      expect(result.status).toBe('ACTIVE');
    });

    test('should throw error for invalid JSON in additionalProfileAttributes', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        additionalProfileAttributes: 'invalid-json',
        address: 'https://example.okta.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid additionalProfileAttributes JSON');
    });

    test('should throw error for missing required params', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        // lastName is missing
        address: 'https://example.okta.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Missing required parameter(s): lastName');
    });

    test('should throw error for missing address', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('No URL specified. Provide address parameter or ADDRESS environment variable');
    });

    test('should throw error for missing OKTA_API_TOKEN', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      const contextWithoutToken = {
        ...mockContext,
        secrets: {}
      };

      await expect(script.invoke(params, contextWithoutToken))
        .rejects.toThrow('No authentication configured');
    });

    test('should handle API error when creating user', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        // GET: user doesn't exist
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({})
          });
        }

        // POST: create user fails
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({
              errorCode: 'E0000001',
              errorSummary: 'Api validation failed: email',
              errorLink: 'E0000001',
              errorId: 'oae123'
            })
          });
        }
      };

      const error = await script.invoke(params, mockContext).catch(e => e);
      expect(error.message).toBe('Failed to create user: HTTP 400');
      expect(error.statusCode).toBe(400);
      expect(error.body.errorSummary).toBe('Api validation failed: email');
    });

    test('should handle API error without JSON body', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        // GET: user doesn't exist
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({})
          });
        }

        // POST: fails with non-JSON response
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => {
              throw new Error('Not JSON');
            }
          });
        }
      };

      const error = await script.invoke(params, mockContext).catch(e => e);
      expect(error.message).toBe('Failed to create user: HTTP 500');
      expect(error.statusCode).toBe(500);
    });

    test('should return existing user when attributes match', async () => {
      const params = {
        email: 'existing.user@example.com',
        login: 'existing.user@example.com',
        firstName: 'Existing',
        lastName: 'User',
        groupIds: 'group1, group2',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        // GET: user exists with matching attributes
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 'existing-user-id-123',
              status: 'ACTIVE',
              created: '2024-01-01T10:00:00.000Z',
              activated: '2024-01-01T10:00:00.000Z',
              statusChanged: '2024-01-01T10:00:00.000Z',
              lastLogin: '2024-01-10T15:30:00.000Z',
              lastUpdated: '2024-01-10T15:30:00.000Z',
              profile: {
                firstName: 'Existing',
                lastName: 'User',
                email: 'existing.user@example.com',
                login: 'existing.user@example.com'
              }
            })
          });
        }
      };

      const result = await script.invoke(params, mockContext);

      // Verify the result contains existing user data
      expect(result.id).toBe('existing-user-id-123');
      expect(result.status).toBe('ACTIVE');
      expect(result.profile.email).toBe('existing.user@example.com');
      expect(result.groupIds).toEqual(['group1', 'group2']);
      expect(result.lastLogin).toBe('2024-01-10T15:30:00.000Z');
    });

    test('should return existing user when attributes match (case insensitive)', async () => {
      const params = {
        email: 'EXISTING.USER@EXAMPLE.COM',
        login: 'existing.user@example.com',
        firstName: 'EXISTING',
        lastName: 'USER',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        // GET: user exists with different case
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 'existing-user-id-456',
              status: 'ACTIVE',
              created: '2024-01-01T10:00:00.000Z',
              activated: '2024-01-01T10:00:00.000Z',
              statusChanged: '2024-01-01T10:00:00.000Z',
              lastLogin: null,
              lastUpdated: '2024-01-01T10:00:00.000Z',
              profile: {
                firstName: 'existing',
                lastName: 'user',
                email: 'existing.user@example.com',
                login: 'existing.user@example.com'
              }
            })
          });
        }
      };

      const result = await script.invoke(params, mockContext);

      expect(result.id).toBe('existing-user-id-456');
      expect(result.status).toBe('ACTIVE');
    });

    test('should throw 409 error when user exists with different attributes', async () => {
      const params = {
        email: 'different.email@example.com',
        login: 'existing.user@example.com',
        firstName: 'Existing',
        lastName: 'User',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        // GET: user exists but with different email
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 'existing-user-id-789',
              status: 'ACTIVE',
              created: '2024-01-01T10:00:00.000Z',
              activated: '2024-01-01T10:00:00.000Z',
              statusChanged: '2024-01-01T10:00:00.000Z',
              lastLogin: null,
              lastUpdated: '2024-01-01T10:00:00.000Z',
              profile: {
                firstName: 'Existing',
                lastName: 'User',
                email: 'existing.user@example.com',
                login: 'existing.user@example.com'
              }
            })
          });
        }
      };

      const error = await script.invoke(params, mockContext).catch(e => e);

      expect(error.message).toBe('Login already exists in the organization for a different user');
      expect(error.statusCode).toBe(409);
    });

    test('should handle error when checking if user exists', async () => {
      const params = {
        email: 'existing.user@example.com',
        login: 'existing.user@example.com',
        firstName: 'Existing',
        lastName: 'User',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        // GET: returns error
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({
              errorCode: 'E0000009',
              errorSummary: 'Internal Server Error'
            })
          });
        }
      };

      const error = await script.invoke(params, mockContext).catch(e => e);

      expect(error.message).toBe('Failed to check if user exists: HTTP 500');
      expect(error.statusCode).toBe(500);
      expect(error.body.errorSummary).toBe('Internal Server Error');
    });


    test('should handle groupIds with various formats', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        groupIds: '  group1  ,group2,  ,  group3  ,',
        address: 'https://example.okta.com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.groupIds).toEqual(['group1', 'group2', 'group3']);
    });

    test('should handle empty groupIds string', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        groupIds: '',
        address: 'https://example.okta.com'
      };

      const result = await script.invoke(params, mockContext);

      expect(result.groupIds).toEqual([]);
    });

    test('should URL encode special characters in login when fetching user', async () => {
      const params = {
        email: 'test+user@example.com',
        login: 'test+user@example.com',
        firstName: 'Test',
        lastName: 'User',
        address: 'https://example.okta.com'
      };

      let getUserUrl = '';
      global.fetch = (url, options) => {
        if (options?.method === 'GET') {
          getUserUrl = url;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 'user-with-special-chars',
              status: 'ACTIVE',
              created: '2024-01-01T10:00:00.000Z',
              activated: '2024-01-01T10:00:00.000Z',
              statusChanged: '2024-01-01T10:00:00.000Z',
              lastLogin: null,
              lastUpdated: '2024-01-01T10:00:00.000Z',
              profile: {
                firstName: 'Test',
                lastName: 'User',
                email: 'test+user@example.com',
                login: 'test+user@example.com'
              }
            })
          });
        }
      };

      const result = await script.invoke(params, mockContext);

      expect(result.id).toBe('user-with-special-chars');
      // Verify URL encoding happened (+ should be encoded as %2B)
      expect(getUserUrl).toContain('test%2Buser%40example.com');
    });

    test('should attach error body to thrown error', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      const errorBody = {
        errorCode: 'E0000001',
        errorSummary: 'Api validation failed',
        errorId: 'oae123'
      };

      global.fetch = (url, options) => {
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({})
          });
        }

        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => errorBody
          });
        }
      };

      try {
        await script.invoke(params, mockContext);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error.statusCode).toBe(400);
        expect(error.body).toEqual(errorBody);
      }
    });

    test('should handle user with whitespace in names', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: '  John  ',
        lastName: '  Doe  ',
        address: 'https://example.okta.com'
      };

      global.fetch = (url, options) => {
        if (options?.method === 'GET') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              id: 'user-whitespace',
              status: 'ACTIVE',
              created: '2024-01-01T10:00:00.000Z',
              activated: '2024-01-01T10:00:00.000Z',
              statusChanged: '2024-01-01T10:00:00.000Z',
              lastLogin: null,
              lastUpdated: '2024-01-01T10:00:00.000Z',
              profile: {
                firstName: 'John',
                lastName: 'Doe',
                email: 'john.doe@example.com',
                login: 'john.doe@example.com'
              }
            })
          });
        }
      };

      const result = await script.invoke(params, mockContext);

      expect(result.id).toBe('user-whitespace');
      expect(result.status).toBe('ACTIVE');
    });
  });

  describe('error handler', () => {
    test('should re-throw error for framework to handle', async () => {
      const params = {
        email: 'john.doe@example.com',
        error: new Error('Network timeout')
      };

      await expect(script.error(params, mockContext))
        .rejects.toThrow('Network timeout');
    });
  });

  describe('halt handler', () => {
    test('should handle graceful shutdown', async () => {
      const params = {
        email: 'john.doe@example.com',
        reason: 'timeout'
      };

      const result = await script.halt(params, mockContext);

      expect(result.email).toBe('john.doe@example.com');
      expect(result.reason).toBe('timeout');
      expect(result.haltedAt).toBeDefined();
      expect(result.cleanupCompleted).toBe(true);
    });

    test('should handle halt with missing params', async () => {
      const params = {
        reason: 'system_shutdown'
      };

      const result = await script.halt(params, mockContext);

      expect(result.email).toBe('unknown');
      expect(result.reason).toBe('system_shutdown');
      expect(result.cleanupCompleted).toBe(true);
    });
  });
});