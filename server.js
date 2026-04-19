/**
 * Hospital CRM API Server
 * 
 * Main entry point for the Hospital CRM API backend.
 * Initializes Express application, configures middleware stack,
 * initializes database, and starts HTTP server.
 * 
 * Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 18.7, 18.8
 */

// Catch-all error handlers — must be first so startup crashes are visible in logs
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// Load environment variables first
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initializeDatabase } = require('./database/init');

// Import routes
const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const appointmentRoutes = require('./routes/appointments');
const doctorRoutes = require('./routes/doctors');
const paymentRoutes = require('./routes/payments');
const leadRoutes = require('./routes/leads');
const analyticsRoutes = require('./routes/analytics');
const userRoutes = require('./routes/users');
const tagRoutes = require('./routes/tags');
const reminderRoutes = require('./routes/reminders');

/**
 * Validate required environment variables
 * Requirements: 18.7, 18.8
 */
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'DB_HOST',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
    'QR_ENCRYPTION_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', missingVars);
    console.error('\n========================================');
    console.error('ERROR: Missing Required Environment Variables');
    console.error('========================================');
    console.error('The following environment variables are required but not set:');
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error('\nPlease set these variables in your .env file or environment.');
    console.error('See .env.example for reference.\n');
    process.exit(1);
  }

  // Validate QR encryption key length (must be 32 characters for AES-256)
  if (process.env.QR_ENCRYPTION_KEY && process.env.QR_ENCRYPTION_KEY.length !== 32) {
    logger.error('QR_ENCRYPTION_KEY must be exactly 32 characters for AES-256-CBC encryption');
    console.error('\n========================================');
    console.error('ERROR: Invalid QR_ENCRYPTION_KEY');
    console.error('========================================');
    console.error('QR_ENCRYPTION_KEY must be exactly 32 characters for AES-256-CBC encryption.');
    console.error(`Current length: ${process.env.QR_ENCRYPTION_KEY.length}`);
    console.error('\nPlease update your .env file with a 32-character key.\n');
    process.exit(1);
  }

  logger.info('Environment variables validated successfully');
}

/**
 * Configure CORS middleware
 * Requirements: 1.3, 17.6, 17.7, 17.8, 17.9
 */
function configureCORS() {
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        return callback(null, true);
      }

      // Get allowed origins from environment variable
      const allowedOrigins = process.env.CORS_ORIGIN 
        ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
        : ['http://localhost:3000'];

      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true, // Allow credentials (cookies, authorization headers)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'] // Expose rate limit headers
  };

  return cors(corsOptions);
}

/**
 * Configure security headers using Helmet
 * Requirements: 1.4, 17.1, 17.2, 17.3, 17.4, 17.5
 */
function configureSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      }
    },
    hsts: {
      maxAge: 31536000, // 1 year in seconds
      includeSubDomains: true,
      preload: true
    },
    frameguard: {
      action: 'deny' // X-Frame-Options: DENY
    },
    noSniff: true, // X-Content-Type-Options: nosniff
    xssFilter: true // X-XSS-Protection: 1; mode=block
  });
}

/**
 * Request logging middleware
 * Requirements: 1.6
 */
function requestLogger(req, res, next) {
  const startTime = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
}

/**
 * Initialize Express application and configure middleware
 * Requirements: 1.1, 1.3, 1.4, 1.5, 1.6
 */
function createApp() {
  const app = express();

  // Security headers (must be first)
  app.use(configureSecurityHeaders());

  // CORS configuration
  app.use(configureCORS());

  // Rate limiting (apply to all routes)
  app.use(apiLimiter);

  // Body parser middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use(requestLogger);

  // Health check endpoint (no authentication required)
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      message: 'Hospital CRM API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/doctors', doctorRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/leads', leadRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/reminders', reminderRoutes);

  // 404 handler for undefined routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.originalUrl || req.url}`
      }
    });
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start HTTP server
 * Requirements: 1.1
 */
async function startServer() {
  // Validate environment variables before anything else
  validateEnvironmentVariables();

  // Create Express app
  const app = createApp();

  // Get port from environment or use default
  const PORT = process.env.PORT || 5000;

  // Start HTTP server FIRST so Hostinger/platform sees it listening immediately
  const server = app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('Hospital CRM API Server');
    console.log('========================================');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Server running on port: ${PORT}`);
    console.log(`Health check: /health`);
    console.log('========================================\n');
    logger.info(`Server started successfully on port ${PORT}`);
  });

  // Initialize WebSocket server
  const WebSocketServer = require('./websocket/server');
  const wsServer = new WebSocketServer(server);
  logger.info('WebSocket server initialized');

  // Make WebSocket server available globally for controllers
  global.wsServer = wsServer;

  // Graceful shutdown handler
  setupGracefulShutdown(server, wsServer);

  // Initialize database AFTER server is already listening
  // This prevents platform startup timeouts on slow remote DB connections
  logger.info('Initializing database (background)...');
  initializeDatabase()
    .then(() => {
      logger.info('Database initialized successfully');
      console.log('✓ Database initialization complete');
    })
    .catch((error) => {
      logger.error('Database initialization failed:', error);
      console.error('DATABASE INIT ERROR:', error.message);
      // Don't exit — server is still running, DB may recover
    });

  return server;
}

/**
 * Setup graceful shutdown handlers
 * Ensures proper cleanup when server is stopped
 */
function setupGracefulShutdown(server, wsServer) {
  // Handle SIGTERM (e.g., from Docker, Kubernetes)
  process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    gracefulShutdown(server, wsServer);
  });

  // Handle SIGINT (e.g., Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    gracefulShutdown(server, wsServer);
  });

  // Handle uncaught exceptions (after server is up)
  process.removeAllListeners('uncaughtException');
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    gracefulShutdown(server, wsServer);
  });

  // Handle unhandled promise rejections (after server is up)
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    gracefulShutdown(server, wsServer);
  });
}

/**
 * Perform graceful shutdown
 * Closes server and cleans up resources
 */
function gracefulShutdown(server, wsServer) {
  console.log('\n========================================');
  console.log('Shutting down gracefully...');
  console.log('========================================\n');

  // Stop WebSocket server first
  if (wsServer) {
    wsServer.stop();
  }

  server.close(() => {
    logger.info('HTTP server closed');
    console.log('Server stopped successfully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

// Export for testing
module.exports = { createApp, startServer };
