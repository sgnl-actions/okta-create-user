/**
 * Okta Create User Action
 *
 * Creates a new user in Okta with specified profile attributes and optionally
 * assigns them to groups.
 */

import { getBaseURL, getAuthorizationHeader, resolveJSONPathTemplates} from '@sgnl-actions/utils';

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
    const jobContext = context.data || {};

    // Resolve JSONPath templates in params
    const { result: resolvedParams, errors } = resolveJSONPathTemplates(params, jobContext);
    if (errors.length > 0) {
      throw new Error(`Failed to resolve template values: ${errors.join(', ')}`);
    }

    const { email, login, firstName, lastName } = resolvedParams;

    console.log(`Starting Okta user creation for ${email}`);

    // Validate required inputs
    if (!email || typeof email !== 'string') {
      throw new Error('Invalid or missing email parameter');
    }
    if (!login || typeof login !== 'string') {
      throw new Error('Invalid or missing login parameter');
    }
    if (!firstName || typeof firstName !== 'string') {
      throw new Error('Invalid or missing firstName parameter');
    }
    if (!lastName || typeof lastName !== 'string') {
      throw new Error('Invalid or missing lastName parameter');
    }

    // Get base URL using utility function
    const baseUrl = getBaseURL(resolvedParams, context);

    // Get authorization header
    let authHeader = await getAuthorizationHeader(context);

    // Handle Okta's SSWS token format for Bearer auth mode
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      authHeader = token.startsWith('SSWS ') ? token : `SSWS ${token}`;
    }

    // Make the API request to create user
    const response = await createUser(
      resolvedParams,
      baseUrl,
      authHeader
    );

    // Handle the response
    if (response.ok) {
      const userData = await response.json();
      console.log(`Successfully created user ${userData.id} (${email})`);

      // Extract group IDs that were assigned
      const assignedGroupIds = resolvedParams.groupIds ?
        resolvedParams.groupIds.split(',').map(id => id.trim()).filter(id => id) :
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