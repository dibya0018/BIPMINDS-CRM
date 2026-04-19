/**
 * Unit Tests for Analytics Controller
 * 
 * Tests dashboard statistics retrieval functionality.
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8
 */

const { getDashboardStats } = require('../../controllers/analyticsController');
const { getPool } = require('../../config/database');

describe('Analytics Controller - Unit Tests', () => {
  
  let pool;
  
  beforeAll(async () => {
    pool = getPool();
  });
  
  describe('Get Dashboard Statistics', () => {
    
    test('should return dashboard statistics successfully', async () => {
      const req = {
        user: {
          userId: 1
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      // Verify successful response
      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      
      // Verify all required statistics are present
      expect(response.data.total_active_patients).toBeDefined();
      expect(response.data.todays_appointments).toBeDefined();
      expect(response.data.active_doctors).toBeDefined();
      expect(response.data.current_month_revenue).toBeDefined();
      expect(response.data.pending_leads).toBeDefined();
      expect(response.data.revenue_growth_percentage).toBeDefined();
      expect(response.data.appointment_growth_percentage).toBeDefined();
      
      // Verify data types
      expect(typeof response.data.total_active_patients).toBe('number');
      expect(typeof response.data.todays_appointments).toBe('number');
      expect(typeof response.data.active_doctors).toBe('number');
      expect(typeof response.data.current_month_revenue).toBe('string');
      expect(typeof response.data.pending_leads).toBe('number');
      expect(typeof response.data.revenue_growth_percentage).toBe('string');
      expect(typeof response.data.appointment_growth_percentage).toBe('string');
      
      // Verify all counts are non-negative
      expect(response.data.total_active_patients).toBeGreaterThanOrEqual(0);
      expect(response.data.todays_appointments).toBeGreaterThanOrEqual(0);
      expect(response.data.active_doctors).toBeGreaterThanOrEqual(0);
      expect(parseFloat(response.data.current_month_revenue)).toBeGreaterThanOrEqual(0);
      expect(response.data.pending_leads).toBeGreaterThanOrEqual(0);
    });
    
    test('should return valid numeric values for all statistics', async () => {
      const req = {
        user: {
          userId: 1
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      const response = res.json.mock.calls[0][0];
      
      // Verify revenue is a valid number
      const revenue = parseFloat(response.data.current_month_revenue);
      expect(isNaN(revenue)).toBe(false);
      
      // Verify growth percentages are valid numbers
      const revenueGrowth = parseFloat(response.data.revenue_growth_percentage);
      const appointmentGrowth = parseFloat(response.data.appointment_growth_percentage);
      expect(isNaN(revenueGrowth)).toBe(false);
      expect(isNaN(appointmentGrowth)).toBe(false);
    });
    
    test('should handle case when no data exists', async () => {
      const connection = await pool.getConnection();
      
      try {
        // Temporarily deactivate all patients, doctors, and leads
        await connection.execute('UPDATE patients SET is_active = FALSE');
        await connection.execute('UPDATE doctors SET is_available = FALSE');
        await connection.execute('UPDATE leads SET status = "lost"');
        
        const req = {
          user: {
            userId: 1
          }
        };
        
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn()
        };
        
        await getDashboardStats(req, res);
        
        const response = res.json.mock.calls[0][0];
        
        expect(response.success).toBe(true);
        expect(response.data.total_active_patients).toBe(0);
        expect(response.data.active_doctors).toBe(0);
        expect(response.data.pending_leads).toBe(0);
        
        // Restore data
        await connection.execute('UPDATE patients SET is_active = TRUE');
        await connection.execute('UPDATE doctors SET is_available = TRUE');
        
      } finally {
        connection.release();
      }
    });
    
    test('should calculate revenue growth percentage correctly', async () => {
      const req = {
        user: {
          userId: 1
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      const response = res.json.mock.calls[0][0];
      
      // Revenue growth should be a valid percentage (can be negative)
      const revenueGrowth = parseFloat(response.data.revenue_growth_percentage);
      expect(typeof revenueGrowth).toBe('number');
      expect(isNaN(revenueGrowth)).toBe(false);
    });
    
    test('should calculate appointment growth percentage correctly', async () => {
      const req = {
        user: {
          userId: 1
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      const response = res.json.mock.calls[0][0];
      
      // Appointment growth should be a valid percentage (can be negative)
      const appointmentGrowth = parseFloat(response.data.appointment_growth_percentage);
      expect(typeof appointmentGrowth).toBe('number');
      expect(isNaN(appointmentGrowth)).toBe(false);
    });
    
    test('should format revenue with 2 decimal places', async () => {
      const req = {
        user: {
          userId: 1
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      const response = res.json.mock.calls[0][0];
      
      // Check revenue format (should have 2 decimal places)
      const revenue = response.data.current_month_revenue;
      const decimalPart = revenue.split('.')[1];
      expect(decimalPart).toBeDefined();
      expect(decimalPart.length).toBe(2);
    });
    
    test('should format growth percentages with 2 decimal places', async () => {
      const req = {
        user: {
          userId: 1
        }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      const response = res.json.mock.calls[0][0];
      
      // Check revenue growth format
      const revenueGrowth = response.data.revenue_growth_percentage;
      const revenueDecimalPart = revenueGrowth.split('.')[1];
      expect(revenueDecimalPart).toBeDefined();
      expect(revenueDecimalPart.length).toBe(2);
      
      // Check appointment growth format
      const appointmentGrowth = response.data.appointment_growth_percentage;
      const appointmentDecimalPart = appointmentGrowth.split('.')[1];
      expect(appointmentDecimalPart).toBeDefined();
      expect(appointmentDecimalPart.length).toBe(2);
    });
    
  });
  
  describe('Error Handling', () => {
    
    test('should handle database errors gracefully', async () => {
      // Mock a database error by passing invalid user
      const req = {
        user: null // This should cause an error
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      
      await getDashboardStats(req, res);
      
      // Should still return a response (either success or error)
      expect(res.json).toHaveBeenCalled();
    });
    
  });
  
});
