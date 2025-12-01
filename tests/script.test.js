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
    // Mock fetch
    global.fetch = () => Promise.resolve({
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

    test('should throw error for missing email', async () => {
      const params = {
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing email parameter');
    });

    test('should throw error for missing login', async () => {
      const params = {
        email: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing login parameter');
    });

    test('should throw error for missing firstName', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing firstName parameter');
    });

    test('should throw error for missing lastName', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        address: 'https://example.okta.com'
      };

      await expect(script.invoke(params, mockContext))
        .rejects.toThrow('Invalid or missing lastName parameter');
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

    test('should handle API error with errorSummary', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      global.fetch = () => Promise.resolve({
        ok: false,
        status: 400,
        json: async () => ({
          errorCode: 'E0000001',
          errorSummary: 'Api validation failed: login',
          errorLink: 'E0000001',
          errorId: 'oae123'
        })
      });

      const error = await script.invoke(params, mockContext).catch(e => e);
      expect(error.message).toBe('Failed to create user: Api validation failed: login');
      expect(error.statusCode).toBe(400);
    });

    test('should handle API error without JSON body', async () => {
      const params = {
        email: 'john.doe@example.com',
        login: 'john.doe@example.com',
        firstName: 'John',
        lastName: 'Doe',
        address: 'https://example.okta.com'
      };

      global.fetch = () => Promise.resolve({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Not JSON');
        }
      });

      const error = await script.invoke(params, mockContext).catch(e => e);
      expect(error.message).toBe('Failed to create user: HTTP 500');
      expect(error.statusCode).toBe(500);
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