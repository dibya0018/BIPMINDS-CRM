/**
 * Jest Test Setup
 * 
 * This file runs before all tests to configure the test environment.
 */

// Load environment variables from .env file
require('dotenv').config();

// Set test environment
process.env.NODE_ENV = 'test';

// Use existing database configuration from .env
// Tests will use the same database as development
// Note: In production, you should use a separate test database

// Increase test timeout for property-based tests
jest.setTimeout(30000);

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
