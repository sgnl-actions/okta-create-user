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
async function createUser(params, oktaDomain, authToken) {
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

  const url = new URL('/api/v1/users', `https://${oktaDomain}`);
  const authHeader = authToken.startsWith('SSWS ') ? authToken : `SSWS ${authToken}`;

  const response = await fetch(url.toString(), {
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
   * @param {string} params.email - User's email address
   * @param {string} params.login - User's login/username
   * @param {string} params.firstName - User's first name
   * @param {string} params.lastName - User's last name
   * @param {string} params.department - User's department (optional)
   * @param {string} params.employeeNumber - Employee number (optional)
   * @param {string} params.groupIds - Comma-separated group IDs (optional)
   * @param {string} params.additionalProfileAttributes - JSON string of additional attributes (optional)
   * @param {string} params.oktaDomain - The Okta domain
   * @param {Object} context - Execution context with env, secrets, outputs
   * @param {string} context.secrets.BEARER_AUTH_TOKEN - Bearer token for Okta API authentication
   * @returns {Object} Job results with created user information
   */
  invoke: async (params, context) => {
    const { email, login, firstName, lastName, oktaDomain } = params;

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
    if (!oktaDomain || typeof oktaDomain !== 'string') {
      throw new Error('Invalid or missing oktaDomain parameter');
    }

    // Validate Okta API token is present
    if (!context.secrets?.BEARER_AUTH_TOKEN) {
      throw new Error('Missing required secret: BEARER_AUTH_TOKEN');
    }

    // Make the API request to create user
    const response = await createUser(
      params,
      oktaDomain,
      context.secrets.BEARER_AUTH_TOKEN
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