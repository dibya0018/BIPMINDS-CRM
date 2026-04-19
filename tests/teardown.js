/**
 * Jest Global Teardown
 * 
 * This file runs after all tests to clean up resources.
 */

module.exports = async () => {
  // Set teardown flag before closing pool
  global.__JEST_TEARDOWN__ = true;
  
  // Give time for async operations to complete before teardown
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Suppress console output during teardown
  const originalError = console.error;
  console.error = () => {};
  
  try {
    const { closePool } = require('../config/database');
    await closePool();
  } catch (error) {
    // Ignore errors during teardown
  } finally {
    // Restore console
    console.error = originalError;
  }
  
  // Give extra time for connections to close
  await new Promise(resolve => setTimeout(resolve, 500));
};
