/**
 * Okta Create User Action
 *
 * Creates a new user in Okta with specified profile attributes and optionally
 * assigns them to groups.
 */

import { getBaseURL, createAuthHeaders} from '@sgnl-actions/utils';

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

export default {
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