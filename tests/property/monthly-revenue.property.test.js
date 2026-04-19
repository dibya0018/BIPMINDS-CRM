/**
 * Property-Based Tests for Monthly Revenue Calculation
 * 
 * Tests universal properties that should hold for monthly revenue calculations.
 * Uses fast-check for property-based testing with reduced iterations for faster execution.
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

/**
 * Calculate monthly revenue from payment records
 * Sums all payments with status 'paid' in the specified month
 * 
 * @param {Array} payments - Array of payment objects
 * @param {number} year - Year (e.g., 2024)
 * @param {number} month - Month (1-12)
 * @returns {number} Total revenue for the month
 */
function calculateMonthlyRevenue(payments, year, month) {
  return payments
    .filter(payment => {
      if (payment.payment_status !== 'paid' || !payment.payment_date) {
        return false;
      }
      
      const paymentDate = new Date(payment.payment_date);
      return paymentDate.getFullYear() === year && 
             paymentDate.getMonth() + 1 === month;
    })
    .reduce((sum, payment) => sum + parseFloat(payment.total_amount || 0), 0);
}

describe('Monthly Revenue Calculation - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 40: Monthly Revenue Calculation
   * 
   * For any month, the revenue calculation should sum all payments with status 'paid'
   * in that month.
   * 
   * Validates: Requirements 9.7, 16.4
   */
  describe('Property 40: Monthly Revenue Calculation', () => {
    
    test('monthly revenue should sum only paid payments in the specified month', () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 }),
            paidPayments: fc.array(
              fc.record({
                payment_status: fc.constant('paid'),
                total_amount: fc.float({ min: Math.fround(10), max: Math.fround(10000), noNaN: true }),
                payment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
              }),
              { minLength: 0, maxLength: 20 }
            ),
            unpaidPayments: fc.array(
              fc.record({
                payment_status: fc.constantFrom('pending', 'partial', 'overdue', 'refunded'),
                total_amount: fc.float({ min: Math.fround(10), max: Math.fround(10000), noNaN: true }),
                payment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
              }),
              { minLength: 0, maxLength: 10 }
            )
          }),
          (data) => {
            // Combine paid and unpaid payments
            const allPayments = [...data.paidPayments, ...data.unpaidPayments];
            
            // Calculate revenue using the function
            const calculatedRevenue = calculateMonthlyRevenue(allPayments, data.year, data.month);
            
            // Calculate expected revenue manually (only paid payments in the specified month)
            const expectedRevenue = data.paidPayments
              .filter(payment => {
                const paymentDate = new Date(payment.payment_date);
                return paymentDate.getFullYear() === data.year && 
                       paymentDate.getMonth() + 1 === data.month;
              })
              .reduce((sum, payment) => sum + parseFloat(payment.total_amount), 0);
            
            // Property 1: Calculated revenue should match expected revenue
            const revenuesMatch = Math.abs(calculatedRevenue - expectedRevenue) < 0.01;
            
            // Property 2: Revenue should be non-negative
            const isNonNegative = calculatedRevenue >= 0;
            
            // Property 3: Revenue should be a valid number
            const isValidNumber = typeof calculatedRevenue === 'number' && !isNaN(calculatedRevenue);
            
            return revenuesMatch && isNonNegative && isValidNumber;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('monthly revenue should be zero when no paid payments exist in the month', () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 }),
            payments: fc.array(
              fc.record({
                payment_status: fc.constantFrom('pending', 'partial', 'overdue', 'refunded'),
                total_amount: fc.float({ min: Math.fround(10), max: Math.fround(10000), noNaN: true }),
                payment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
              }),
              { minLength: 0, maxLength: 20 }
            )
          }),
          (data) => {
            // Calculate revenue (should be zero since no paid payments)
            const revenue = calculateMonthlyRevenue(data.payments, data.year, data.month);
            
            // Property: Revenue should be zero
            return revenue === 0;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('monthly revenue should exclude payments from other months', () => {
      fc.assert(
        fc.property(
          fc.record({
            targetYear: fc.integer({ min: 2020, max: 2030 }),
            targetMonth: fc.integer({ min: 1, max: 12 }),
            targetMonthPayments: fc.array(
              fc.record({
                payment_status: fc.constant('paid'),
                total_amount: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true })
              }),
              { minLength: 1, maxLength: 10 }
            ),
            otherMonthPayments: fc.array(
              fc.record({
                payment_status: fc.constant('paid'),
                total_amount: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }),
                monthOffset: fc.integer({ min: 1, max: 11 })
              }),
              { minLength: 0, maxLength: 10 }
            )
          }),
          (data) => {
            // Create payments for target month
            const targetPayments = data.targetMonthPayments.map(p => ({
              ...p,
              payment_date: new Date(data.targetYear, data.targetMonth - 1, 15)
            }));
            
            // Create payments for other months
            const otherPayments = data.otherMonthPayments.map(p => {
              const otherMonth = (data.targetMonth + p.monthOffset) % 12 || 12;
              const otherYear = data.targetYear + Math.floor((data.targetMonth + p.monthOffset - 1) / 12);
              return {
                ...p,
                payment_date: new Date(otherYear, otherMonth - 1, 15)
              };
            });
            
            // Combine all payments
            const allPayments = [...targetPayments, ...otherPayments];
            
            // Calculate revenue for target month
            const revenue = calculateMonthlyRevenue(allPayments, data.targetYear, data.targetMonth);
            
            // Calculate expected revenue (only target month payments)
            const expectedRevenue = targetPayments.reduce((sum, p) => sum + parseFloat(p.total_amount), 0);
            
            // Property: Revenue should only include target month payments
            return Math.abs(revenue - expectedRevenue) < 0.01;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('monthly revenue should handle empty payment array', () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 })
          }),
          (data) => {
            // Calculate revenue with empty array
            const revenue = calculateMonthlyRevenue([], data.year, data.month);
            
            // Property: Revenue should be zero
            return revenue === 0;
          }
        ),
        { numRuns: 20 }
      );
    });

    test('monthly revenue should handle payments with null or undefined dates', () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 }),
            validPayments: fc.array(
              fc.record({
                payment_status: fc.constant('paid'),
                total_amount: fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true }),
                payment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
              }),
              { minLength: 0, maxLength: 10 }
            ),
            invalidPayments: fc.array(
              fc.record({
                payment_status: fc.constant('paid'),
                total_amount: fc.float({ min: Math.fround(10), max: Math.fround(5000), noNaN: true }),
                payment_date: fc.constantFrom(null, undefined)
              }),
              { minLength: 0, maxLength: 5 }
            )
          }),
          (data) => {
            // Combine valid and invalid payments
            const allPayments = [...data.validPayments, ...data.invalidPayments];
            
            // Calculate revenue (should only include valid payments)
            const revenue = calculateMonthlyRevenue(allPayments, data.year, data.month);
            
            // Calculate expected revenue (only valid payments in the month)
            const expectedRevenue = data.validPayments
              .filter(payment => {
                const paymentDate = new Date(payment.payment_date);
                return paymentDate.getFullYear() === data.year && 
                       paymentDate.getMonth() + 1 === data.month;
              })
              .reduce((sum, payment) => sum + parseFloat(payment.total_amount), 0);
            
            // Property: Revenue should match expected (ignoring invalid dates)
            return Math.abs(revenue - expectedRevenue) < 0.01;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('monthly revenue should be additive across multiple payments', () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month: fc.integer({ min: 1, max: 12 }),
            payment1: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }),
            payment2: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }),
            payment3: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true })
          }),
          (data) => {
            const paymentDate = new Date(data.year, data.month - 1, 15);
            
            // Create three paid payments in the same month
            const payments = [
              { payment_status: 'paid', total_amount: data.payment1, payment_date: paymentDate },
              { payment_status: 'paid', total_amount: data.payment2, payment_date: paymentDate },
              { payment_status: 'paid', total_amount: data.payment3, payment_date: paymentDate }
            ];
            
            // Calculate total revenue
            const totalRevenue = calculateMonthlyRevenue(payments, data.year, data.month);
            
            // Calculate expected sum
            const expectedSum = data.payment1 + data.payment2 + data.payment3;
            
            // Property: Total revenue should equal sum of individual payments
            return Math.abs(totalRevenue - expectedSum) < 0.01;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('monthly revenue for different months should be independent', () => {
      fc.assert(
        fc.property(
          fc.record({
            year: fc.integer({ min: 2020, max: 2030 }),
            month1: fc.integer({ min: 1, max: 11 }),
            amount1: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true }),
            amount2: fc.float({ min: Math.fround(100), max: Math.fround(5000), noNaN: true })
          }),
          (data) => {
            const month2 = data.month1 + 1;
            
            // Create payments for two different months
            const payments = [
              { 
                payment_status: 'paid', 
                total_amount: data.amount1, 
                payment_date: new Date(data.year, data.month1 - 1, 15) 
              },
              { 
                payment_status: 'paid', 
                total_amount: data.amount2, 
                payment_date: new Date(data.year, month2 - 1, 15) 
              }
            ];
            
            // Calculate revenue for each month
            const revenue1 = calculateMonthlyRevenue(payments, data.year, data.month1);
            const revenue2 = calculateMonthlyRevenue(payments, data.year, month2);
            
            // Property 1: Month 1 revenue should equal amount1
            const month1Correct = Math.abs(revenue1 - data.amount1) < 0.01;
            
            // Property 2: Month 2 revenue should equal amount2
            const month2Correct = Math.abs(revenue2 - data.amount2) < 0.01;
            
            // Property 3: Revenues should be different (unless amounts are equal)
            const independent = Math.abs(data.amount1 - data.amount2) < 0.01 || 
                              Math.abs(revenue1 - revenue2) > 0.01;
            
            return month1Correct && month2Correct && independent;
          }
        ),
        { numRuns: 50 }
      );
    });

  });

});
