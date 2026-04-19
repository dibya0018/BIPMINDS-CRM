# Database Configuration Module

## Overview

The database configuration module (`database.js`) provides a robust MySQL connection pool with automatic error handling, retry logic, and reconnection capabilities.

## Features

- **Connection Pooling**: Efficient connection management with configurable pool size
- **Automatic Retry**: Exponential backoff retry logic for transient failures
- **Error Handling**: Comprehensive error handling with detailed logging
- **Auto-Reconnection**: Automatic reconnection on connection loss
- **Environment-Based Config**: All settings configurable via environment variables

## Usage

### Basic Query

```javascript
const db = require('./config/database');

// Simple query
const [rows] = await db.query('SELECT * FROM patients WHERE patient_id = ?', [123]);
console.log(rows);
```

### Prepared Statement

```javascript
// Prepared statement (more secure)
const [results] = await db.execute(
  'INSERT INTO patients (first_name, last_name, phone) VALUES (?, ?, ?)',
  ['John', 'Doe', '1234567890']
);
console.log('Inserted ID:', results.insertId);
```

### Get Connection from Pool

```javascript
// Get a connection for transactions
const connection = await db.getConnection();
try {
  await connection.beginTransaction();
  
  // Execute queries
  await connection.query('INSERT INTO ...');
  await connection.query('UPDATE ...');
  
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release(); // Always release back to pool
}
```

### Test Connection

```javascript
// Test if database is accessible
const isConnected = await db.testConnection();
if (isConnected) {
  console.log('Database is accessible');
}
```

### Close Pool (Graceful Shutdown)

```javascript
// Close pool when shutting down server
await db.closePool();
```

## Configuration

Configure via environment variables in `.env` file:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hospital_crm
```

## Connection Pool Settings

- **Connection Limit**: 10 connections
- **Wait for Connections**: true (queue requests when pool is full)
- **Queue Limit**: 0 (unlimited queue)
- **Connection Timeout**: 10 seconds
- **Keep Alive**: Enabled
- **Character Set**: utf8mb4 (full Unicode support)

## Retry Logic

The module implements automatic retry for transient errors:

- **Retryable Errors**:
  - `PROTOCOL_CONNECTION_LOST`
  - `ECONNRESET`
  - `ETIMEDOUT`
  - `PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR`

- **Retry Strategy**: Exponential backoff
  - Attempt 1: Immediate
  - Attempt 2: 1 second delay
  - Attempt 3: 2 seconds delay
  - Maximum delay: 5 seconds

- **Default Retries**: 3 attempts

## Error Handling

All errors are logged with detailed messages. The module distinguishes between:

1. **Retryable Errors**: Automatically retried with backoff
2. **Non-Retryable Errors**: Immediately thrown to caller
3. **Pool Errors**: Logged and handled by event listeners

## API Reference

### `query(sql, params, retries)`
Execute a SQL query with automatic retry logic.
- **sql**: SQL query string
- **params**: Array of query parameters (default: [])
- **retries**: Number of retry attempts (default: 3)
- **Returns**: Promise<[rows, fields]>

### `execute(sql, params, retries)`
Execute a prepared statement with automatic retry logic.
- **sql**: SQL query string
- **params**: Array of query parameters (default: [])
- **retries**: Number of retry attempts (default: 3)
- **Returns**: Promise<[rows, fields]>

### `getConnection()`
Get a connection from the pool.
- **Returns**: Promise<PoolConnection>

### `getPool()`
Get the connection pool instance.
- **Returns**: Pool

### `testConnection()`
Test database connectivity.
- **Returns**: Promise<boolean>

### `closePool()`
Close the connection pool gracefully.
- **Returns**: Promise<void>

## Requirements Validation

This module validates the following requirements:

- **Requirement 1.2**: API Server establishes MySQL connection pool on startup
- **Requirement 1.7**: Automatic reconnection on database connection failure
- **Requirement 18.3**: Database credentials loaded from environment variables

## Testing

Run the test file to verify database connectivity:

```bash
node config/database.test.js
```

**Note**: Requires a running MySQL server with credentials configured in `.env` file.
