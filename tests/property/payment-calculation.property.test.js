/**
 * Property-Based Tests for Payment Calculation
 * 
 * Tests universal properties that should hold for all payment calculations.
 * Uses fast-check for property-based testing with reduced iterations for faster execution.
 */

const fc = require('fast-check');
const { calculateTotalAmount } = require('../../controllers/paymentController');

describe('Payment Calculation - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 14: Payment Calculation Accuracy
   * 
   * For any payment with amount, tax, and discount, the total amount should equal
   * amount + tax - discount.
   * 
   * Validates: Requirements 9.2
   */
  describe('Property 14: Payment Calculation Accuracy', () => {
    
    test('total amount should equal amount + tax - discount', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
            taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
            discountAmount: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true })
          }),
          (data) => {
            // Calculate total using the function
            const calculatedTotal = calculateTotalAmount(data.amount, data.taxAmount, data.discountAmount);
            
            // Calculate expected total manually
            const expectedTotal = parseFloat((data.amount + data.taxAmount - data.discountAmount).toFixed(2));
            
            // Property 1: Calculated total should match expected total
            const totalsMatch = Math.abs(calculatedTotal - expectedTotal) < 0.01;
            
            // Property 2: Total should be a number
            const isNumber = typeof calculatedTotal === 'number' && !isNaN(calculatedTotal);
            
            // Property 3: Total should have at most 2 decimal places
            const hasCorrectPrecision = calculatedTotal.toString().split('.')[1]?.length <= 2 || !calculatedTotal.toString().includes('.');
            
            return totalsMatch && isNumber && hasCorrectPrecision;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('total amount should be non-negative when amount + tax >= discount', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
            taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
            discountAmount: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          }),
          (data) => {
            // Ensure discount is less than or equal to amount + tax
            const discount = Math.min(data.discountAmount, data.amount + data.taxAmount);
            
            // Calculate total
            const total = calculateTotalAmount(data.amount, data.taxAmount, discount);
            
            // Property: Total should be non-negative
            return total >= 0;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('total amount should increase when tax increases', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
            taxAmount1: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
            taxAmount2: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
            discountAmount: fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })
          }),
          (data) => {
            // Ensure tax2 > tax1
            const tax1 = Math.min(data.taxAmount1, data.taxAmount2);
            const tax2 = Math.max(data.taxAmount1, data.taxAmount2);
            
            // Skip if taxes are equal
            if (Math.abs(tax1 - tax2) < 0.01) {
              return true;
            }
            
            // Calculate totals with different tax amounts
            const total1 = calculateTotalAmount(data.amount, tax1, data.discountAmount);
            const total2 = calculateTotalAmount(data.amount, tax2, data.discountAmount);
            
            // Property: Total with higher tax should be greater
            return total2 > total1;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('total amount should decrease when discount increases', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(1000), max: Math.fround(100000), noNaN: true }),
            taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
            discountAmount1: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
            discountAmount2: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true })
          }),
          (data) => {
            // Ensure discount2 > discount1
            const discount1 = Math.min(data.discountAmount1, data.discountAmount2);
            const discount2 = Math.max(data.discountAmount1, data.discountAmount2);
            
            // Skip if discounts are equal
            if (Math.abs(discount1 - discount2) < 0.01) {
              return true;
            }
            
            // Calculate totals with different discount amounts
            const total1 = calculateTotalAmount(data.amount, data.taxAmount, discount1);
            const total2 = calculateTotalAmount(data.amount, data.taxAmount, discount2);
            
            // Property: Total with higher discount should be lower
            return total2 < total1;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('total amount with zero tax and discount should equal base amount', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
          (amount) => {
            // Calculate total with zero tax and discount
            const total = calculateTotalAmount(amount, 0, 0);
            
            // Property: Total should equal base amount
            return Math.abs(total - amount) < 0.01;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('total amount should handle default parameters correctly', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true }),
          (amount) => {
            // Calculate total without providing tax and discount (should default to 0)
            const total = calculateTotalAmount(amount);
            
            // Property: Total should equal base amount when tax and discount are not provided
            return Math.abs(total - amount) < 0.01;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('calculation should be commutative for tax additions', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
            tax1: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
            tax2: fc.float({ min: Math.fround(0), max: Math.fround(5000), noNaN: true }),
            discountAmount: fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true })
          }),
          (data) => {
            // Calculate total with combined tax
            const totalCombined = calculateTotalAmount(data.amount, data.tax1 + data.tax2, data.discountAmount);
            
            // Calculate total with separate tax additions
            const totalSeparate1 = calculateTotalAmount(data.amount, data.tax1, data.discountAmount);
            const totalSeparate2 = totalSeparate1 + data.tax2;
            
            // Property: Results should be equal (within floating point precision)
            return Math.abs(totalCombined - totalSeparate2) < 0.01;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('total amount should handle edge case of very small amounts', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1), noNaN: true }),
            taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(0.1), noNaN: true }),
            discountAmount: fc.float({ min: Math.fround(0), max: Math.fround(0.1), noNaN: true })
          }),
          (data) => {
            // Calculate total
            const total = calculateTotalAmount(data.amount, data.taxAmount, data.discountAmount);
            
            // Property 1: Total should be a valid number
            const isValid = typeof total === 'number' && !isNaN(total);
            
            // Property 2: Total should match expected calculation
            const expected = parseFloat((data.amount + data.taxAmount - data.discountAmount).toFixed(2));
            const matches = Math.abs(total - expected) < 0.01;
            
            return isValid && matches;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('total amount should handle edge case of very large amounts', () => {
      fc.assert(
        fc.property(
          fc.record({
            amount: fc.float({ min: Math.fround(100000), max: Math.fround(1000000), noNaN: true }),
            taxAmount: fc.float({ min: Math.fround(0), max: Math.fround(100000), noNaN: true }),
            discountAmount: fc.float({ min: Math.fround(0), max: Math.fround(50000), noNaN: true })
          }),
          (data) => {
            // Calculate total
            const total = calculateTotalAmount(data.amount, data.taxAmount, data.discountAmount);
            
            // Property 1: Total should be a valid number
            const isValid = typeof total === 'number' && !isNaN(total);
            
            // Property 2: Total should match expected calculation
            const expected = parseFloat((data.amount + data.taxAmount - data.discountAmount).toFixed(2));
            const matches = Math.abs(total - expected) < 0.01;
            
            return isValid && matches;
          }
        ),
        { numRuns: 50 }
      );
    });

  });

});
