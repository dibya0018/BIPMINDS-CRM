# Hospital CRM API Backend

A comprehensive Node.js/Express REST API backend for hospital customer relationship management.

## Features

- **JWT Authentication** - Secure token-based authentication
- **Role-Based Access Control** - Granular permission system
- **QR Code System** - Encrypted QR codes for patient identification
- **Automatic Database Initialization** - Auto-creates and seeds database on first run
- **Comprehensive Audit Logging** - All sensitive operations logged
- **Rate Limiting** - Protection against abuse and DDoS attacks
- **Input Validation** - XSS and SQL injection prevention
- **RESTful API** - Standard REST endpoints for all resources

## Technology Stack

- **Runtime**: Node.js v18+
- **Framework**: Express.js
- **Database**: MySQL 8.0+
- **Cache**: Redis
- **Authentication**: JWT (jsonwebtoken)
- **Password Hashing**: bcrypt
- **Validation**: express-validator
- **Security**: Helmet, CORS, express-rate-limit
- **Logging**: Winston
- **QR Codes**: qrcode library

## Prerequisites

- Node.js v18 or higher
- MySQL 8.0 or higher
- Redis (optional, for rate limiting and caching)

## Installation

1. Clone the repository
2. Navigate to the project directory:
   ```bash
   cd hospital-crm-api
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Create `.env` file from `.env.example`:
   ```bash
   cp .env.example .env
   ```

5. Update `.env` with your configuration:
   
   **Required Variables:**
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - MySQL connection
   - `JWT_SECRET` - Secret key for JWT tokens (min 32 characters)
   - `JWT_REFRESH_SECRET` - Secret key for refresh tokens (different from JWT_SECRET)
   - `QR_ENCRYPTION_KEY` - 32-character key for QR code encryption
   - `REDIS_HOST`, `REDIS_PORT` - Redis connection (optional but recommended)
   - `CORS_ORIGIN` - Frontend URL (e.g., http://localhost:3000)

   **Generate Secure Keys:**
   ```bash
   # Generate JWT secret
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Generate QR encryption key (must be exactly 32 characters)
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```

   **Optional Variables:**
   - `PORT` - Server port (default: 5000)
   - `NODE_ENV` - Environment mode (development/production)
   - Rate limiting, logging, and file upload settings

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on port 5000 (or the port specified in `.env`).

## Database Initialization

The system automatically initializes the database on first run:

1. **Database Creation**: Creates the `hospital_crm` database if it doesn't exist
2. **Table Creation**: Creates all 17 required tables with proper schema, indexes, and foreign keys
3. **Stored Procedures**: Installs all stored procedures for authentication, CRUD operations, and analytics
4. **Default Roles**: Creates 6 default roles (super_admin, admin, doctor, nurse, receptionist, accountant)
5. **Permissions**: Creates permissions for all resources and actions
6. **Role-Permission Mapping**: Assigns appropriate permissions to each role
7. **Demo Data**: Seeds demo data for immediate testing

### Demo Data Credentials

After first run, you can log in with these credentials:

**Super Admin Account:**
- **Email**: `admin@hospital.com`
- **Password**: `Admin@123`
- **Role**: Super Admin (full system access)

**Demo Data Includes:**
- 1 Super Admin user
- 1 Demo doctor profile (Dr. John Smith, Cardiologist)
- 1 Demo patient with complete medical records
- 1 Demo appointment linking patient and doctor
- 1 Demo payment record
- 1 Demo lead record

### Manual Database Reset

If you need to reset the database:

```bash
# Connect to MySQL
mysql -u root -p

# Drop the database
DROP DATABASE IF EXISTS hospital_crm;

# Restart the server to trigger auto-initialization
npm start
```

## Project Structure

```
hospital-crm-api/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── database/        # Database schema, procedures, and seeds
├── middleware/      # Express middleware
├── routes/          # API route definitions
├── utils/           # Utility functions
├── tests/           # Test files
├── logs/            # Application logs
├── uploads/         # File uploads
├── qr-codes/        # Generated QR codes
├── .env.example     # Environment variables template
├── .gitignore       # Git ignore rules
├── package.json     # Dependencies and scripts
└── server.js        # Application entry point
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Patients
- `GET /api/patients` - List patients (with pagination and search)
- `GET /api/patients/:id` - Get patient by ID
- `POST /api/patients` - Create new patient
- `PUT /api/patients/:id` - Update patient
- `DELETE /api/patients/:id` - Soft delete patient
- `GET /api/patients/:id/qr-code` - Get patient QR code
- `POST /api/patients/scan-qr` - Scan patient QR code

### Appointments
- `GET /api/appointments` - List appointments
- `GET /api/appointments/:id` - Get appointment by ID
- `POST /api/appointments` - Create appointment
- `PUT /api/appointments/:id` - Update appointment
- `PATCH /api/appointments/:id/status` - Update appointment status
- `DELETE /api/appointments/:id` - Cancel appointment

### Doctors
- `GET /api/doctors` - List doctors
- `GET /api/doctors/:id` - Get doctor by ID
- `POST /api/doctors` - Create doctor profile
- `PUT /api/doctors/:id` - Update doctor
- `GET /api/doctors/:id/availability` - Get doctor availability

### Payments
- `GET /api/payments` - List payments
- `GET /api/payments/:id` - Get payment by ID
- `POST /api/payments` - Create payment
- `PATCH /api/payments/:id/status` - Update payment status

### Leads
- `GET /api/leads` - List leads
- `GET /api/leads/:id` - Get lead by ID
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `PATCH /api/leads/:id/convert` - Convert lead to patient

### Analytics
- `GET /api/analytics/dashboard` - Get dashboard statistics

## Security Features

- **JWT Authentication** - Stateless token-based auth
- **Password Hashing** - bcrypt with 12 salt rounds
- **Rate Limiting** - Configurable limits per endpoint
- **Input Validation** - express-validator for all inputs
- **XSS Prevention** - Input sanitization
- **SQL Injection Prevention** - Parameterized queries
- **Security Headers** - Helmet middleware
- **CORS** - Configurable origin whitelist
- **Audit Logging** - All sensitive operations logged

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- **Unit Tests** (`tests/unit/`) - Test individual functions and modules
- **Property-Based Tests** (`tests/property/`) - Test universal correctness properties
- **Integration Tests** - Test end-to-end workflows

## Troubleshooting

### Database Connection Issues

**Error: "Access denied for user"**
- Check `DB_USER` and `DB_PASSWORD` in `.env`
- Ensure MySQL user has CREATE DATABASE privileges

**Error: "Can't connect to MySQL server"**
- Verify MySQL is running: `mysql --version`
- Check `DB_HOST` and `DB_PORT` in `.env`

### Redis Connection Issues

**Error: "Redis connection failed"**
- Verify Redis is running: `redis-cli ping` (should return "PONG")
- Check `REDIS_HOST` and `REDIS_PORT` in `.env`
- Redis is optional; rate limiting will fall back to memory store

### Environment Variable Issues

**Error: "Required environment variable missing"**
- Ensure `.env` file exists in project root
- Copy from `.env.example`: `cp .env.example .env`
- Verify all required variables are set

### Port Already in Use

**Error: "Port 5000 is already in use"**
- Change `PORT` in `.env` to a different port
- Or stop the process using port 5000

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

## Common Error Codes

- `AUTH_001` - Invalid credentials
- `AUTH_002` - Token expired
- `AUTH_003` - Unauthorized access
- `PERM_001` - Permission denied
- `VAL_001` - Validation error
- `NOT_FOUND` - Resource not found
- `CONFLICT` - Resource already exists
- `RATE_LIMIT` - Too many requests
- `SERVER_ERROR` - Internal server error

## Development Tips

1. **Use Postman/Insomnia** for API testing
2. **Check logs** in `logs/` directory for debugging
3. **Enable debug logging** by setting `LOG_LEVEL=debug` in `.env`
4. **Use nodemon** for auto-restart during development (`npm run dev`)
5. **Review audit logs** in `audit_logs` table for security events

## License

ISC

## Support

For issues and questions, please contact the development team.
