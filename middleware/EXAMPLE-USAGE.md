# Permission Middleware - Usage Examples

## Basic Usage

### Example 1: Protecting a Single Route

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { createPatient } = require('../controllers/patientController');

// Only users with 'patients:create' permission can access this route
router.post('/patients',
  authenticate,                          // Step 1: Verify JWT token
  checkPermission('patients', 'create'), // Step 2: Check permission
  createPatient                          // Step 3: Execute controller
);

module.exports = router;
```

### Example 2: Multiple Routes with Different Permissions

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const {
  getPatients,
  getPatientById,
  createPatient,
  updatePatient,
  deletePatient
} = require('../controllers/patientController');

// GET /patients - requires 'patients:read' permission
router.get('/patients',
  authenticate,
  checkPermission('patients', 'read'),
  getPatients
);

// GET /patients/:id - requires 'patients:read' permission
router.get('/patients/:id',
  authenticate,
  checkPermission('patients', 'read'),
  getPatientById
);

// POST /patients - requires 'patients:create' permission
router.post('/patients',
  authenticate,
  checkPermission('patients', 'create'),
  createPatient
);

// PUT /patients/:id - requires 'patients:update' permission
router.put('/patients/:id',
  authenticate,
  checkPermission('patients', 'update'),
  updatePatient
);

// DELETE /patients/:id - requires 'patients:delete' permission
router.delete('/patients/:id',
  authenticate,
  checkPermission('patients', 'delete'),
  deletePatient
);

module.exports = router;
```

### Example 3: With Validation Middleware

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');
const { validatePatient, handleValidationErrors } = require('../middleware/validation');
const { createPatient } = require('../controllers/patientController');

router.post('/patients',
  authenticate,                          // 1. Authenticate user
  checkPermission('patients', 'create'), // 2. Check permission
  validatePatient,                       // 3. Validate request data
  handleValidationErrors,                // 4. Handle validation errors
  createPatient                          // 5. Execute controller
);

module.exports = router;
```

## Advanced Usage

### Example 4: Cache Management

```javascript
const { 
  checkPermission, 
  invalidateUserCache, 
  clearCache 
} = require('../middleware/permission');

// When user roles change, invalidate their permission cache
async function updateUserRoles(userId, newRoles) {
  // Update roles in database
  await db.query('UPDATE user_roles SET role_id = ? WHERE user_id = ?', [newRoles, userId]);
  
  // Invalidate user's permission cache
  invalidateUserCache(userId);
}

// When role-permission mappings change, clear all caches
async function updateRolePermissions(roleId, newPermissions) {
  // Update permissions in database
  await db.query('UPDATE role_permissions SET permission_id = ? WHERE role_id = ?', [newPermissions, roleId]);
  
  // Clear all permission caches
  clearCache();
}
```

### Example 5: Custom Error Handling

```javascript
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/permission');

// Custom error handler for permission denied
router.use((err, req, res, next) => {
  if (err.code === 'PERM_001') {
    // Log unauthorized access attempt
    console.error(`Unauthorized access attempt by user ${req.user?.userId} to ${req.path}`);
    
    // Return custom error response
    return res.status(403).json({
      success: false,
      error: {
        code: 'PERM_001',
        message: 'Access denied. Please contact your administrator for access.',
        requestedResource: req.path
      }
    });
  }
  next(err);
});

module.exports = router;
```

## Testing Examples

### Example 6: Testing Permission Middleware

```javascript
const request = require('supertest');
const app = require('../server');
const { generateAccessToken } = require('../utils/jwt');

describe('Permission Middleware Tests', () => {
  
  test('should allow access with valid permission', async () => {
    // Create user with 'patients:read' permission
    const user = {
      userId: 1,
      email: 'admin@hospital.com',
      userType: 'admin',
      roles: ['super_admin']
    };
    
    const token = generateAccessToken(user);
    
    const response = await request(app)
      .get('/api/patients')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
  });
  
  test('should deny access without permission', async () => {
    // Create user without 'patients:delete' permission
    const user = {
      userId: 2,
      email: 'receptionist@hospital.com',
      userType: 'staff',
      roles: ['receptionist']
    };
    
    const token = generateAccessToken(user);
    
    const response = await request(app)
      .delete('/api/patients/1')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PERM_001');
  });
  
});
```

## Permission Matrix

### Default Role Permissions

| Role | Patients | Appointments | Doctors | Payments | Leads | Users | Settings |
|------|----------|--------------|---------|----------|-------|-------|----------|
| **super_admin** | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD | CRUD |
| **admin** | CRUD | CRUD | CRUD | CRUD | CRUD | R | R |
| **doctor** | R | RU | R | R | - | - | - |
| **nurse** | R | R | R | - | - | - | - |
| **receptionist** | CRU | CRUD | R | R | CRUD | - | - |
| **accountant** | R | R | R | CRUD | R | - | - |

Legend:
- C = Create
- R = Read
- U = Update
- D = Delete
- \- = No access

## Common Patterns

### Pattern 1: Read-Only Access

```javascript
// Allow all authenticated users to read, but only specific roles to modify
router.get('/doctors', authenticate, checkPermission('doctors', 'read'), getDoctors);
router.post('/doctors', authenticate, checkPermission('doctors', 'create'), createDoctor);
```

### Pattern 2: Hierarchical Permissions

```javascript
// Super admins can do everything, admins can read/update, others can only read
router.get('/settings', authenticate, checkPermission('settings', 'read'), getSettings);
router.put('/settings', authenticate, checkPermission('settings', 'update'), updateSettings);
```

### Pattern 3: Resource-Specific Permissions

```javascript
// Different permissions for different resources
router.post('/patients', authenticate, checkPermission('patients', 'create'), createPatient);
router.post('/appointments', authenticate, checkPermission('appointments', 'create'), createAppointment);
router.post('/payments', authenticate, checkPermission('payments', 'create'), createPayment);
```

## Troubleshooting

### Issue 1: Permission Denied for Valid User

**Problem:** User has the correct role but still gets 403 error.

**Solution:**
1. Check if role-permission mapping exists in database
2. Clear permission cache: `clearCache()`
3. Verify stored procedure `sp_check_permission` is working
4. Check database connection

### Issue 2: Cache Not Working

**Problem:** Permission checks are slow even with cache.

**Solution:**
1. Verify cache TTL is set correctly (default: 5 minutes)
2. Check if cache is being cleared too frequently
3. Consider using Redis for distributed caching in production

### Issue 3: Authentication Required Error

**Problem:** Getting 401 error instead of 403.

**Solution:**
- Ensure `authenticate` middleware is called BEFORE `checkPermission`
- Verify JWT token is valid and not expired
- Check Authorization header format: `Bearer <token>`

## Best Practices

1. **Always authenticate before checking permissions**
   ```javascript
   // ✅ Correct
   router.post('/patients', authenticate, checkPermission('patients', 'create'), createPatient);
   
   // ❌ Wrong - will fail
   router.post('/patients', checkPermission('patients', 'create'), authenticate, createPatient);
   ```

2. **Use specific permissions instead of role checks**
   ```javascript
   // ✅ Correct - check specific permission
   checkPermission('patients', 'create')
   
   // ❌ Wrong - don't check roles directly
   if (req.user.roles.includes('admin')) { ... }
   ```

3. **Clear cache when permissions change**
   ```javascript
   // After updating user roles
   invalidateUserCache(userId);
   
   // After updating role permissions
   clearCache();
   ```

4. **Handle errors gracefully**
   ```javascript
   router.use((err, req, res, next) => {
     if (err.code === 'PERM_001') {
       // Log and return user-friendly error
     }
     next(err);
   });
   ```

5. **Test permission logic thoroughly**
   - Test with users having different roles
   - Test with users having no permissions
   - Test cache behavior
   - Test error scenarios
