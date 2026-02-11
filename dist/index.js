// SGNL Job Script - Auto-generated bundle
'use strict';

/**
 * SGNL Actions - Authentication Utilities
 *
 * Shared authentication utilities for SGNL actions.
 * Supports: Bearer Token, Basic Auth, OAuth2 Client Credentials, OAuth2 Authorization Code
 */

/**
 * Get OAuth2 access token using client credentials flow
 * @param {Object} config - OAuth2 configuration
 * @param {string} config.tokenUrl - Token endpoint URL
 * @param {string} config.clientId - Client ID
 * @param {string} config.clientSecret - Client secret
 * @param {string} [config.scope] - OAuth2 scope
 * @param {string} [config.audience] - OAuth2 audience
 * @param {string} [config.authStyle] - Auth style: 'InParams' or 'InHeader' (default)
 * @returns {Promise<string>} Access token
 */
async function getClientCredentialsToken(config) {
  const { tokenUrl, clientId, clientSecret, scope, audience, authStyle } = config;

  if (!tokenUrl || !clientId || !clientSecret) {
    throw new Error('OAuth2 Client Credentials flow requires tokenUrl, clientId, and clientSecret');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  if (scope) {
    params.append('scope', scope);
  }

  if (audience) {
    params.append('audience', audience);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json'
  };

  if (authStyle === 'InParams') {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  } else {
    const credentials = btoa(`${clientId}:${clientSecret}`);
    headers['Authorization'] = `Basic ${credentials}`;
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: params.toString()
  });

  if (!response.ok) {
    let errorText;
    try {
      const errorData = await response.json();
      errorText = JSON.stringify(errorData);
    } catch {
      errorText = await response.text();
    }
    throw new Error(
      `OAuth2 token request failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('No access_token in OAuth2 response');
  }

  return data.access_token;
}

/**
 * Get the Authorization header value from context using available auth method.
 * Supports: Bearer Token, Basic Auth, OAuth2 Authorization Code, OAuth2 Client Credentials
 *
 * @param {Object} context - Execution context with environment and secrets
 * @param {Object} context.environment - Environment variables
 * @param {Object} context.secrets - Secret values
 * @returns {Promise<string>} Authorization header value (e.g., "Bearer xxx" or "Basic xxx")
 */
async function getAuthorizationHeader(context) {
  const env = context.environment || {};
  const secrets = context.secrets || {};

  // Method 1: Simple Bearer Token
  if (secrets.BEARER_AUTH_TOKEN) {
    const token = secrets.BEARER_AUTH_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 2: Basic Auth (username + password)
  if (secrets.BASIC_PASSWORD && secrets.BASIC_USERNAME) {
    const credentials = btoa(`${secrets.BASIC_USERNAME}:${secrets.BASIC_PASSWORD}`);
    return `Basic ${credentials}`;
  }

  // Method 3: OAuth2 Authorization Code - use pre-existing access token
  if (secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN) {
    const token = secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN;
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  // Method 4: OAuth2 Client Credentials - fetch new token
  if (secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET) {
    const tokenUrl = env.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL;
    const clientId = env.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID;
    const clientSecret = secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET;

    if (!tokenUrl || !clientId) {
      throw new Error('OAuth2 Client Credentials flow requires TOKEN_URL and CLIENT_ID in env');
    }

    const token = await getClientCredentialsToken({
      tokenUrl,
      clientId,
      clientSecret,
      scope: env.OAUTH2_CLIENT_CREDENTIALS_SCOPE,
      audience: env.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE,
      authStyle: env.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
    });

    return `Bearer ${token}`;
  }

  throw new Error(
    'No authentication configured. Provide one of: ' +
    'BEARER_AUTH_TOKEN, BASIC_USERNAME/BASIC_PASSWORD, ' +
    'OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN, or OAUTH2_CLIENT_CREDENTIALS_*'
  );
}

/**
 * Get the base URL/address for API calls
 * @param {Object} params - Request parameters
 * @param {string} [params.address] - Address from params
 * @param {Object} context - Execution context
 * @returns {string} Base URL
 */
function getBaseURL(params, context) {
  const env = context.environment || {};
  const address = params?.address || env.ADDRESS;

  if (!address) {
    throw new Error('No URL specified. Provide address parameter or ADDRESS environment variable');
  }

  // Remove trailing slash if present
  return address.endsWith('/') ? address.slice(0, -1) : address;
}

/**
 * Create full headers object with Authorization and common headers
 * @param {Object} context - Execution context with env and secrets
 * @returns {Promise<Object>} Headers object with Authorization, Accept, Content-Type
 */
async function createAuthHeaders(context) {
  const authHeader = await getAuthorizationHeader(context);
  return {
    'Authorization': authHeader,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
}

/**
 * Okta Create User Action
 *
 * Creates a new user in Okta with specified profile attributes and optionally
 * assigns them to groups.
 */


async function getOktaAuthHeader(context) {
  const headers = await createAuthHeaders(context);

  // Handle Okta's SSWS token format - only for Bearer token auth mode
  if (context.secrets.BEARER_AUTH_TOKEN && headers['Authorization'].startsWith('Bearer ')) {
    const token = headers['Authorization'].substring(7);
    headers['Authorization'] = token.startsWith('SSWS ') ? token : `SSWS ${token}`;
  }

  return headers;
}

function assertRequired(params, keys) {
  const missing = keys.filter((k) => !params?.[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required parameter(s): ${missing.join(', ')}`);
  }
}

function assertSameIdentity(existingProfile, params) {
  const existingEmail = String(existingProfile.email).trim().toLowerCase();
  const incomingEmail = String(params.email).trim().toLowerCase();

  if (existingEmail !== incomingEmail) {
    const err = new Error('Login already exists in the organization for a user with a different email');
    err.statusCode = 409;
    throw err;
  }
}

/**
 * Helper function to fetch an existing user by login
 * @private
 */
async function getUser(login, baseUrl, headers) {
  const url = `${baseUrl}/api/v1/users/${encodeURIComponent(login)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: headers
  });

  return response;
}

/**
 * Helper function to create a user in Okta
 * @private
 */
async function createUser(params, baseUrl, headers) {
  const { email, login, firstName, lastName, department, employeeNumber, groupIds, additionalProfileAttributes } = params;

  // Build profile object with required fields
  const profile = {
    email,
    login,
    firstName,
    lastName
  };

  // Add optional fields if provided
  if (department) {
    profile.department = department;
  }
  if (employeeNumber) {
    profile.employeeNumber = employeeNumber;
  }

  // Parse and add additional profile attributes if provided
  if (additionalProfileAttributes) {
    try {
      const additionalAttrs = JSON.parse(additionalProfileAttributes);
      Object.assign(profile, additionalAttrs);
    } catch (error) {
      throw new Error(`Invalid additionalProfileAttributes JSON: ${error.message}`);
    }
  }

  // Build request body
  const requestBody = {
    profile
  };

  // Parse and add group IDs if provided
  const groupIdArray = parseGroupIds(groupIds);
  if (groupIdArray.length > 0) {
    requestBody.groupIds = groupIdArray;
  }

  // Build URL using base URL (already cleaned by getBaseUrl)
  const url = `${baseUrl}/api/v1/users`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  return response;
}

/**
 * Parse comma-separated group IDs from params
 * @param {Object} params - Job input parameters
 * @returns {Array<string>} Array of group IDs
 * @private
 */
function parseGroupIds(groupIds) {
  if (!groupIds) {
    return [];
  }
  return groupIds.split(',').map(id => id.trim()).filter(id => id);
}

/**
 * Build standardized user response object
 * @param {Object} userData - User data from Okta API
 * @param {Array<string>} groupIds - Array of group IDs
 * @returns {Object} Standardized response object
 * @private
 */
function buildUserResponse(userData, groupIds) {
  return {
    id: userData.id,
    status: userData.status,
    created: userData.created,
    activated: userData.activated,
    statusChanged: userData.statusChanged,
    lastLogin: userData.lastLogin,
    lastUpdated: userData.lastUpdated,
    profile: userData.profile,
    groupIds: groupIds
  };
}

var script = {
  /**
   * Main execution handler - creates a new user in Okta
   * @param {Object} params - Job input parameters
   * @param {string} params.firstName - User's first name
   * @param {string} params.lastName - User's last name
   * @param {string} params.email - User's email address
   * @param {string} params.login - User's login/username
   * @param {string} params.department - User's department (optional)
   * @param {string} params.employeeNumber - Employee number (optional)
   * @param {string} params.groupIds - Comma-separated group IDs (optional)
   * @param {string} params.additionalProfileAttributes - JSON string of additional attributes (optional)
   * @param {string} params.address - Full URL to Okta API (defaults to ADDRESS environment variable)
   *
   * @param {Object} context - Execution context with secrets and environment
   * @param {string} context.environment.ADDRESS - Default Okta API base URL
   *
   * The configured auth type will determine which of the following environment variables and secrets are available
   * @param {string} context.secrets.BEARER_AUTH_TOKEN
   *
   * @param {string} context.secrets.BASIC_USERNAME
   * @param {string} context.secrets.BASIC_PASSWORD
   *
   * @param {string} context.secrets.OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUDIENCE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_SCOPE
   * @param {string} context.environment.OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL
   *
   * @param {string} context.secrets.OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN
   *
   * @returns {Object} Job results with created user information
   */
  invoke: async (params, context) => {
    assertRequired(params, ['email', 'login', 'firstName', 'lastName']);

    const { email, login } = params;

    console.log(`Starting Okta user creation for ${email}`);

    // Get base URL using utility function
    const baseUrl = getBaseURL(params, context);
    const authHeader = await getOktaAuthHeader(context);

    // Check if user already exists
    const getUserResponse = await getUser(login, baseUrl, authHeader);

    if (getUserResponse.ok) {
      // User already exists, compare attributes
      const existingUser = await getUserResponse.json();
      assertSameIdentity(existingUser.profile, params);

      // User exists with matching attributes, return existing user
      console.log(`User ${existingUser.id} already exists with matching attributes`);
      const groupIds = parseGroupIds(params.groupIds);
      return buildUserResponse(existingUser, groupIds);
    }

    if (getUserResponse.status === 404) {
      // User doesn't exist, create new user
      const createUserResponse = await createUser(params, baseUrl, authHeader);

      if (createUserResponse.ok) {
        const userData = await createUserResponse.json();
        console.log(`Successfully created user ${userData.id}`);

        const groupIds = parseGroupIds(params.groupIds);
        return buildUserResponse(userData, groupIds);
      }

      // Failed to create user
      const errorMessage = `Failed to create user: HTTP ${createUserResponse.status}`;
      let errorBody;
      try {
        errorBody = await createUserResponse.json();
        console.error('Create user error details:', errorBody);
      } catch {
        console.error('Failed to parse error response');
      }

      const error = new Error(errorMessage);
      error.statusCode = createUserResponse.status;
      error.body = errorBody;
      throw error;
    }

    // Unexpected error when checking for existing user
    const errorMessage = `Failed to check if user exists: HTTP ${getUserResponse.status}`;
    let errorBody;
    try {
      errorBody = await getUserResponse.json();
      console.error('Get user error details:', errorBody);
    } catch {
      console.error('Failed to parse error response');
    }

    const error = new Error(errorMessage);
    error.statusCode = getUserResponse.status;
    error.body = errorBody;
    throw error;
  },

  /**
   * Error recovery handler - framework handles retries by default
   * @param {Object} params - Original params plus error information
   * @param {Object} context - Execution context
   * @returns {Object} Recovery results
   */
  error: async (params, _context) => {
    const { error, email } = params;
    console.error(`User creation failed for ${email}: ${error.message}`);

    // Framework handles retries for transient errors (429, 502, 503, 504)
    // Just re-throw the error to let the framework handle it
    throw error;
  },

  /**
   * Graceful shutdown handler - cleanup when job is halted
   * @param {Object} params - Original params plus halt reason
   * @param {Object} context - Execution context
   * @returns {Object} Cleanup results
   */
  halt: async (params, _context) => {
    const { reason, email } = params;
    console.log(`User creation job is being halted (${reason}) for ${email}`);

    // No cleanup needed for this simple operation
    // The POST request either completed or didn't

    return {
      email: email || 'unknown',
      reason: reason,
      haltedAt: new Date().toISOString(),
      cleanupCompleted: true
    };
  }
};

module.exports = script;
