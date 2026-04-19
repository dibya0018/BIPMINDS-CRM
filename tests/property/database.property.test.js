/**
 * Property-Based Tests for Database Connection Pool
 * 
 * These tests verify universal properties that should hold true for the
 * database connection pool across all valid executions.
 * 
 * Testing Framework: Jest + fast-check
 */

const fc = require('fast-check');
const { getPool, getConnection, closePool, testConnection } = require('../../config/database');

// Feature: hospital-crm-api, Property 34: Connection Pool Availability
// **Validates: Requirements 1.2**

describe('Property 34: Connection Pool Availability', () => {
  afterAll(async () => {
    // Clean up: close the pool after all tests
    await closePool();
  });

  test('connection pool should provide connections without blocking indefinitely', async () => {
    // Property: For any API request requiring database access, 
    // the connection pool should provide a connection without blocking indefinitely
    
    await fc.assert(
      fc.asyncProperty(
        // Generate a number of concurrent connection requests (1-10)
        fc.integer({ min: 1, max: 10 }),
        async (numRequests) => {
          const connections = [];
          const startTime = Date.now();
          const timeout = 15000; // 15 second timeout
          
          try {
            // Request multiple connections concurrently
            const connectionPromises = Array.from({ length: numRequests }, async () => {
              const conn = await getConnection();
              connections.push(conn);
              return conn;
            });
            
            // All connections should be obtained within the timeout period
            const results = await Promise.race([
              Promise.all(connectionPromises),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Connection timeout')), timeout)
              )
            ]);
            
            const elapsedTime = Date.now() - startTime;
            
            // Verify all connections were obtained
            expect(results).toHaveLength(numRequests);
            expect(connections).toHaveLength(numRequests);
            
            // Verify connections were obtained without blocking indefinitely
            expect(elapsedTime).toBeLessThan(timeout);
            
            // Verify each connection is valid
            for (const conn of connections) {
              expect(conn).toBeDefined();
              expect(typeof conn.query).toBe('function');
              expect(typeof conn.execute).toBe('function');
              expect(typeof conn.release).toBe('function');
            }
            
            return true;
          } finally {
            // Always release connections to avoid pool exhaustion
            for (const conn of connections) {
              if (conn && typeof conn.release === 'function') {
                conn.release();
              }
            }
          }
        }
      ),
      { numRuns: 100, timeout: 20000 } // Run 100 iterations with 20s timeout per test
    );
  });

  test('connection pool should handle concurrent requests without deadlock', async () => {
    // Property: Multiple concurrent connection requests should all succeed
    // without causing deadlock or indefinite blocking
    
    await fc.assert(
      fc.asyncProperty(
        // Generate number of concurrent batches (2-5)
        fc.integer({ min: 2, max: 5 }),
        async (numBatches) => {
          const allConnections = [];
          
          try {
            // Create multiple batches of concurrent connection requests
            for (let batch = 0; batch < numBatches; batch++) {
              const batchConnections = [];
              
              // Request 3 connections per batch
              const batchPromises = Array.from({ length: 3 }, async () => {
                const conn = await getConnection();
                batchConnections.push(conn);
                return conn;
              });
              
              const results = await Promise.all(batchPromises);
              allConnections.push(...batchConnections);
              
              // Verify batch succeeded
              expect(results).toHaveLength(3);
              
              // Release connections from this batch before next batch
              for (const conn of batchConnections) {
                conn.release();
              }
            }
            
            // Verify total connections obtained equals expected
            expect(allConnections).toHaveLength(numBatches * 3);
            
            return true;
          } catch (error) {
            // Clean up any connections that were obtained
            for (const conn of allConnections) {
              if (conn && typeof conn.release === 'function') {
                try {
                  conn.release();
                } catch (e) {
                  // Ignore release errors during cleanup
                }
              }
            }
            throw error;
          }
        }
      ),
      { numRuns: 50, timeout: 30000 } // Run 50 iterations with 30s timeout
    );
  });

  test('connection pool should provide valid connections that can execute queries', async () => {
    // Property: Any connection obtained from the pool should be able to execute queries
    
    await fc.assert(
      fc.asyncProperty(
        // Generate a simple query to test
        fc.constantFrom(
          'SELECT 1 as test',
          'SELECT NOW() as `now_time`',
          'SELECT DATABASE() as db_name',
          'SELECT VERSION() as version'
        ),
        async (testQuery) => {
          let connection;
          
          try {
            // Get a connection from the pool
            connection = await getConnection();
            
            // Verify connection is valid
            expect(connection).toBeDefined();
            
            // Execute a test query
            const [rows] = await connection.query(testQuery);
            
            // Verify query returned results
            expect(rows).toBeDefined();
            expect(Array.isArray(rows)).toBe(true);
            expect(rows.length).toBeGreaterThan(0);
            
            return true;
          } finally {
            // Always release the connection
            if (connection) {
              connection.release();
            }
          }
        }
      ),
      { numRuns: 100, timeout: 15000 } // Run 100 iterations
    );
  });

  test('connection pool should not exhaust when connections are properly released', async () => {
    // Property: Repeatedly acquiring and releasing connections should not exhaust the pool
    
    await fc.assert(
      fc.asyncProperty(
        // Generate number of sequential connection cycles (10-20)
        fc.integer({ min: 10, max: 20 }),
        async (numCycles) => {
          for (let i = 0; i < numCycles; i++) {
            let connection;
            
            try {
              // Get a connection
              connection = await getConnection();
              expect(connection).toBeDefined();
              
              // Use the connection (simple query)
              const [rows] = await connection.query('SELECT 1 as test');
              expect(rows).toBeDefined();
              
            } finally {
              // Release the connection
              if (connection) {
                connection.release();
              }
            }
          }
          
          // After all cycles, pool should still be functional
          const isHealthy = await testConnection();
          expect(isHealthy).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 50, timeout: 30000 } // Run 50 iterations
    );
  });

  test('connection pool should handle connection errors gracefully', async () => {
    // Property: Even when connections fail, the pool should remain functional
    
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (numAttempts) => {
          let successfulConnections = 0;
          
          for (let i = 0; i < numAttempts; i++) {
            let connection;
            
            try {
              connection = await getConnection();
              
              if (connection) {
                successfulConnections++;
                
                // Verify connection works
                await connection.query('SELECT 1');
              }
            } catch (error) {
              // Connection errors are acceptable, but pool should remain functional
              console.log(`Connection attempt ${i + 1} failed (expected in some cases):`, error.message);
            } finally {
              if (connection) {
                connection.release();
              }
            }
          }
          
          // At least some connections should succeed (pool is functional)
          // In a healthy system, all should succeed, but we allow for transient failures
          expect(successfulConnections).toBeGreaterThan(0);
          
          return true;
        }
      ),
      { numRuns: 30, timeout: 20000 } // Run 30 iterations
    );
  });
});
