# Okta Create User Action

Create a new Okta user account with specified profile information. This action allows you to create users with standard and custom profile attributes, and optionally assign them to groups.

## Overview

This SGNL action integrates with Okta to create new user accounts. When executed, a new user will be created in Okta with the specified profile information and optional group memberships.

## Prerequisites

- Okta instance
- API authentication credentials (supports 4 auth methods - see Configuration below)
- Okta API access with permissions to create users and manage group membership

## Configuration

### Authentication

This action supports four authentication methods. Configure one of the following:

#### Option 1: Bearer Token (Okta API Token)
| Secret | Description |
|--------|-------------|
| `BEARER_AUTH_TOKEN` | Okta API token (SSWS format) |

#### Option 2: Basic Authentication
| Secret | Description |
|--------|-------------|
| `BASIC_USERNAME` | Username for Okta authentication |
| `BASIC_PASSWORD` | Password for Okta authentication |

#### Option 3: OAuth2 Client Credentials
| Secret/Environment | Description |
|-------------------|-------------|
| `OAUTH2_CLIENT_CREDENTIALS_CLIENT_SECRET` | OAuth2 client secret |
| `OAUTH2_CLIENT_CREDENTIALS_CLIENT_ID` | OAuth2 client ID |
| `OAUTH2_CLIENT_CREDENTIALS_TOKEN_URL` | OAuth2 token endpoint URL |
| `OAUTH2_CLIENT_CREDENTIALS_SCOPE` | OAuth2 scope (optional) |
| `OAUTH2_CLIENT_CREDENTIALS_AUDIENCE` | OAuth2 audience (optional) |
| `OAUTH2_CLIENT_CREDENTIALS_AUTH_STYLE` | OAuth2 auth style (optional) |

#### Option 4: OAuth2 Authorization Code
| Secret | Description |
|--------|-------------|
| `OAUTH2_AUTHORIZATION_CODE_ACCESS_TOKEN` | OAuth2 access token |

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ADDRESS` | Default Okta API base URL | `https://dev-12345.okta.com` |

### Input Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `firstName` | string | Yes | User's first name | `John` |
| `lastName` | string | Yes | User's last name | `Doe` |
| `email` | string | Yes | User's email address | `john.doe@example.com` |
| `login` | string | Yes | User's login username (typically email) | `john.doe@example.com` |
| `address` | string | No | Override API base URL | `https://custom.okta.com` |
| `department` | string | No | User's department | `Engineering` |
| `employeeNumber` | string | No | Employee number | `EMP12345` |
| `groupIds` | string | No | Comma-separated list of group IDs to assign user to | `group1, group2, group3` |
| `additionalProfileAttributes` | string | No | JSON string of additional profile attributes | `{"mobilePhone": "555-1234"}` |

### Output Structure

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | The newly created user ID |
| `status` | string | User account status (typically ACTIVE) |
| `profile` | object | User profile information |
| `created` | datetime | When the user was created (ISO 8601) |
| `activated` | datetime | When the user was activated (ISO 8601) |
| `lastUpdated` | datetime | When the user was last updated (ISO 8601) |
| `groupIds` | array | List of group IDs the user was assigned to |

## Usage Example

### Job Request

```json
{
  "id": "create-user-001",
  "type": "nodejs-22",
  "script": {
    "repository": "github.com/sgnl-actions/okta-create-user",
    "version": "v1.0.0",
    "type": "nodejs"
  },
  "script_inputs": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "login": "john.doe@example.com",
    "department": "Engineering",
    "employeeNumber": "EMP001",
    "groupIds": "00g1234567890abcdef, 00g9876543210fedcba"
  },
  "environment": {
    "ADDRESS": "https://dev-12345.okta.com",
    "LOG_LEVEL": "info"
  }
}
```

### Successful Response

```json
{
  "id": "00u1234567890abcdef",
  "status": "ACTIVE",
  "created": "2024-01-15T10:00:00.000Z",
  "activated": "2024-01-15T10:00:00.000Z",
  "lastUpdated": "2024-01-15T10:00:00.000Z",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "login": "john.doe@example.com",
    "department": "Engineering",
    "employeeNumber": "EMP001"
  },
  "groupIds": ["00g1234567890abcdef", "00g9876543210fedcba"]
}
```

## How It Works

The action performs the following operations:

1. **Validate Input**: Ensures all required parameters are provided (firstName, lastName, email, login)
2. **Build User Profile**: Constructs the user profile with required and optional fields
3. **Parse Additional Attributes**: Processes additionalProfileAttributes JSON if provided
4. **Authenticate**: Uses configured authentication method to get authorization
5. **Create User**: Makes POST request to `/api/v1/users` with activate=true parameter
6. **Assign to Groups**: If groupIds provided, assigns user to each specified group
7. **Return Result**: Returns the created user object with assigned group IDs

## Error Handling

The action includes error handling for common scenarios:

### HTTP Status Codes
- **200 OK**: Successful user creation (expected response)
- **400 Bad Request**: Invalid profile data or duplicate user
- **401 Unauthorized**: Invalid authentication credentials
- **403 Forbidden**: Insufficient permissions
- **429 Rate Limit**: Too many requests

### Common Errors
- **Invalid or missing firstName parameter**: firstName is required
- **Invalid or missing lastName parameter**: lastName is required
- **Invalid or missing email parameter**: email is required
- **Invalid or missing login parameter**: login is required
- **Invalid additionalProfileAttributes JSON**: JSON parsing failed
- **Failed to create user**: API error with details

## Development

### Local Testing

```bash
# Install dependencies
npm install

# Run tests
npm test

# Test locally with mock data
npm run dev

# Build for production
npm run build
```

### Running Tests

The action includes comprehensive unit tests covering:
- Input validation (all required parameters)
- Authentication handling (all 4 auth methods)
- Success scenarios (with and without optional fields)
- Group assignment functionality
- Error handling (API errors, missing credentials, invalid JSON)
- Additional profile attributes handling

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Check test coverage
npm run test:coverage
```

## Security Considerations

- **Credential Protection**: Never log or expose authentication credentials
- **User Impact**: Created users are immediately active and can log in
- **Audit Logging**: All operations are logged with timestamps
- **Input Validation**: All required fields and profile data are validated
- **Group Permissions**: Users inherit all permissions from assigned groups
- **Data Integrity**: Profile data is validated before user creation

## Okta API Reference

This action uses the following Okta API endpoints:
- [Create User](https://developer.okta.com/docs/reference/api/users/#create-user) - POST `/api/v1/users?activate=true`
- [Add User to Group](https://developer.okta.com/docs/reference/api/groups/#add-user-to-group) - PUT `/api/v1/groups/{groupId}/users/{userId}`

## Troubleshooting

### Common Issues

1. **"Invalid or missing firstName parameter"**
   - Ensure firstName is provided and is a non-empty string

2. **"Invalid or missing lastName parameter"**
   - Ensure lastName is provided and is a non-empty string

3. **"Invalid or missing email parameter"**
   - Ensure email is provided and is a valid email address

4. **"Invalid or missing login parameter"**
   - Ensure login is provided and is a non-empty string
   - Login is typically the same as email

5. **"Invalid additionalProfileAttributes JSON"**
   - Ensure additionalProfileAttributes is valid JSON
   - Example: `{"mobilePhone": "555-1234", "title": "Engineer"}`

6. **"No URL specified. Provide address parameter or ADDRESS environment variable"**
   - Set the ADDRESS environment variable or provide address parameter
   - Example: `https://dev-12345.okta.com`

7. **"No authentication configured"**
   - Ensure you have configured one of the four supported authentication methods
   - Check that the required secrets/environment variables are set

8. **"Failed to create user: HTTP 400"**
   - User may already exist with same login or email
   - Check profile data format and values
   - Verify all required fields are valid

9. **"Failed to create user: HTTP 403"**
   - Ensure your API credentials have permission to create users
   - If using groupIds, verify permissions to manage group membership
   - Check Okta admin console for required permissions

10. **Group assignment failures**
    - Verify all group IDs exist in Okta
    - Ensure API credentials have group management permissions
    - Check that group IDs are correctly formatted

## Version History

### v1.0.0
- Initial release
- Support for creating users via Okta API
- Four authentication methods (Bearer, Basic, OAuth2 Client Credentials, OAuth2 Authorization Code)
- Support for standard and custom profile attributes
- Automatic group assignment during user creation
- Integration with @sgnl-actions/utils package
- Comprehensive error handling

## License

MIT

## Support

For issues or questions, please contact SGNL Engineering or create an issue in this repository.
