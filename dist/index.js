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
 * Okta Create User Action
 *
 * Creates a new user in Okta with specified profile attributes and optionally
 * assigns them to groups.
 */


/**
 * Helper function to create a user in Okta
 * @private
 */
async function createUser(params, baseUrl, authHeader) {
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
  if (groupIds) {
    const groupIdArray = groupIds.split(',').map(id => id.trim()).filter(id => id);
    if (groupIdArray.length > 0) {
      requestBody.groupIds = groupIdArray;
    }
  }

  // Build URL using base URL (already cleaned by getBaseUrl)
  const url = `${baseUrl}/api/v1/users`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  return response;
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

    const { email, login, firstName, lastName } = params;

    console.log(`Starting Okta user creation for ${email}`);

    // Get base URL using utility function
    const baseUrl = getBaseURL(params, context);

    // Get authorization header
    let authHeader = await getAuthorizationHeader(context);

    // Handle Okta's SSWS token format - only for Bearer token auth mode
    if (context.secrets.BEARER_AUTH_TOKEN && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      authHeader = token.startsWith('SSWS ') ? token : `SSWS ${token}`;
    }

    // Make the API request to create user
    const response = await createUser(
      params,
      baseUrl,
      authHeader
    );

    // Handle the response
    if (response.ok) {
      const userData = await response.json();
      console.log(`Successfully created user ${userData.id} (${email})`);

      // Extract group IDs that were assigned
      const assignedGroupIds = params.groupIds ?
        params.groupIds.split(',').map(id => id.trim()).filter(id => id) :
        [];

      return {
        id: userData.id,
        status: userData.status,
        created: userData.created,
        activated: userData.activated,
        statusChanged: userData.statusChanged,
        lastLogin: userData.lastLogin,
        lastUpdated: userData.lastUpdated,
        profile: userData.profile,
        groupIds: assignedGroupIds
      };
    }

    // Handle error responses
    const statusCode = response.status;
    let errorMessage = `Failed to create user: HTTP ${statusCode}`;

    try {
      const errorBody = await response.json();
      if (errorBody.errorSummary) {
        errorMessage = `Failed to create user: ${errorBody.errorSummary}`;
      }
      console.error('Okta API error response:', errorBody);
    } catch {
      // Response might not be JSON
      console.error('Failed to parse error response');
    }

    // Throw error with status code for proper error handling
    const error = new Error(errorMessage);
    error.statusCode = statusCode;
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
