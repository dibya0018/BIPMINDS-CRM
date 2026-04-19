# Middleware Documentation

## Overview

This directory contains all middleware modules for the Hospital CRM API. Middleware functions are executed in sequence for each request and provide cross-cutting concerns like authentication, authorization, validation, and logging.

## Available Middleware

### 1. Authentication Middleware (`auth.js`)

**Purpose:** Verifies JWT tokens and authenticates users.

**Usage:**
```javascript
const { authenticate } = require('./middleware/auth');

router.get('/protected-route', authenticate, (req, res) => {
  // req.user is now available with userId, email, userType, roles
  res.json({ user: req.user });
});
```

**Requirements:** 4.7, 4.8

### 2. Permission Middleware (`permission.js`)

**Purpose:** Implements Role-Based Access Control (RBAC) by checking user permissions.

**Usage:**
```javascript
const { authenticate } = require('./middleware/auth');
const { checkPermission } = require('./middleware/permission');

// Must be used AFTER authenticate middleware
router.post('/patients', 
  authenticate,                          // First: authenticate user
  checkPermission('patients', 'create'), // Then: check permission
  createPatient                          // Finally: execute controller
);
```

**Available Resources:**
- `patients` - Patient management
- `appointments` - Appointment scheduling
- `doctors` - Doctor profiles
- `payments` - Payment processing
- `leads` - Lead management
- `users` - User management
- `settings` - System settings

**Available Actions:**
- `create` - Create new records
- `read` - View records
- `update` - Modify existing records
- `delete` - Remove records

**Caching:**
- Permission checks are cached in memory for 5 minutes
- Cache is automatically invalidated after TTL expires
- Use `clearCache()` to manually clear all cached permissions
- Use `invalidateUserCache(userId)` to clear cache for specific user

**Requirements:** 5.3, 5.5, 5.6

### 3. Validation Middleware (`validation.js`)

**Purpose:** Validates and sanitizes request data.

**Usage:**
```javascript
const { validatePatient, handleValidationErrors } = require('./middleware/validation');

router.post('/patients',
  authenticate,
  checkPermission('patients', 'create'),
  validatePatient,              // Validate request body
  handleValidationErrors,       // Handle validation errors
  createPatient
);
```

**Requirements:** 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10

## Middleware Execution Order

The typical middleware stack for a protected route:

```javascript
router.post('/resource',
  // 1. Rate limiting (if applicable)
  rateLimiter,
  
  // 2. Authentication - verify JWT token
  authenticate,
  
  // 3. Authorization - check permissions
  checkPermission('resource', 'action'),
  
  // 4. Validation - validate request data
  validateResource,
  handleValidationErrors,
  
  // 5. Audit logging (if applicable)
  auditLog,
  
  // 6. Controller - business logic
  controllerFunction
);
```

## Error Responses

### Authentication Errors (401)
```json
{
  "success": false,
  "error": {
    "code": "AUTH_002",
    "message": "Invalid or expired token"
  }
}
```

### Authorization Errors (403)
```json
{
  "success": false,
  "error": {
    "code": "PERM_001",
    "message": "Permission denied: You do not have permission to create patients"
  }
}
```

### Validation Errors (400)
```json
{
  "success": false,
  "error": {
    "code": "VAL_001",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## Testing

Each middleware module has corresponding unit tests and property-based tests:

- `tests/unit/auth.test.js` - Unit tests for authentication
- `tests/property/jwt.property.test.js` - Property tests for JWT tokens
- `tests/property/permission.property.test.js` - Property tests for permissions
- `tests/property/validation.property.test.js` - Property tests for validation

Run tests:
```bash
npm test                           # Run all tests
npm test -- auth.test.js          # Run specific test file
npm run test:coverage             # Run with coverage report
```

## Best Practices

1. **Always use authenticate before checkPermission**
   - Permission checks require authenticated user data
   - Attempting to check permissions without authentication will fail

2. **Use specific permissions**
   - Instead of checking for admin role, check for specific permissions
   - This allows for more granular access control

3. **Cache invalidation**
   - Clear permission cache when roles or permissions change
   - Use `invalidateUserCache(userId)` when user roles change
   - Use `clearCache()` when role-permission mappings change

4. **Error handling**
   - Always handle middleware errors appropriately
   - Return standardized error responses
   - Log errors for debugging

5. **Testing**
   - Test middleware in isolation
   - Test middleware integration
   - Use property-based tests for universal properties

## Example: Complete Route with All Middleware

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validatePatient, handleValidationErrors } = require('../middleware/validation');
const { apiLimiter } = require('../middleware/rateLimiter');
const { auditLog } = require('../middleware/audit');
const { createPatient } = require('../controllers/patientController');

router.post('/patients',
  apiLimiter,                           // Rate limiting
  authenticate,                         // Authentication
  checkPermission('patients', 'create'), // Authorization
  validatePatient,                      // Validation
  handleValidationErrors,               // Validation error handling
  auditLog,                            // Audit logging
  createPatient                        // Controller
);

module.exports = router;
```

## Redis Integration (Production)

For production deployments with multiple server instances, replace the in-memory cache with Redis:

```javascript
// Install Redis client
npm install redis

// Update permission.js to use Redis
const redis = require('redis');
const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

// Replace Map-based cache with Redis operations
async function getFromCache(userId, resource, action) {
  const key = getCacheKey(userId, resource, action);
  const value = await client.get(key);
  return value ? JSON.parse(value) : null;
}

async function setInCache(userId, resource, action, hasPermission) {
  const key = getCacheKey(userId, resource, action);
  await client.setex(key, 300, JSON.stringify(hasPermission)); // 5 minutes TTL
}
```
