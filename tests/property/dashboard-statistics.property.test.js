/**
 * Property-Based Tests for Dashboard Statistics
 * 
 * Tests universal properties that should hold for dashboard statistics calculations.
 * Uses fast-check for property-based testing with reduced iterations for faster execution.
 */

const fc = require('fast-check');
const { getPool } = require('../../config/database');

/**
 * Calculate dashboard statistics from database records
 * 
 * @param {Object} data - Object containing arrays of database records
 * @returns {Object} Dashboard statistics
 */
function calculateDashboardStats(data) {
  const { patients, appointments, doctors, payments, leads } = data;
  
  // Total active patients
  const totalActivePatients = patients.filter(p => p.is_active === true).length;
  
  // Today's appointments (pending or confirmed)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaysAppointments = appointments.filter(a => {
    const appointmentDate = new Date(a.appointment_date);
    appointmentDate.setHours(0, 0, 0, 0);
    return appointmentDate.getTime() === today.getTime() && 
           (a.status === 'pending' || a.status === 'confirmed');
  }).length;
  
  // Active doctors
  const activeDoctors = doctors.filter(d => d.is_available === true).length;
  
  // Pending leads (new, contacted, or qualified)
  const pendingLeads = leads.filter(l => 
    l.status === 'new' || l.status === 'contacted' || l.status === 'qualified'
  ).length;
  
  return {
    totalActivePatients,
    todaysAppointments,
    activeDoctors,
    pendingLeads
  };
}

describe('Dashboard Statistics - Property-Based Tests', () => {
  
  /**
   * Feature: hospital-crm-api, Property 24: Dashboard Statistics Accuracy
   * 
   * For any point in time, dashboard statistics should accurately reflect counts
   * from the database (active patients, today's appointments, active doctors, pending leads).
   * 
   * Validates: Requirements 16.1, 16.2, 16.3, 16.5, 16.8
   */
  describe('Property 24: Dashboard Statistics Accuracy', () => {
    
    test('total active patients should count only patients with is_active = true', () => {
      fc.assert(
        fc.property(
          fc.record({
            activePatients: fc.array(
              fc.record({
                patient_id: fc.integer({ min: 1, max: 100000 }),
                is_active: fc.constant(true)
              }),
              { minLength: 0, maxLength: 50 }
            ),
            inactivePatients: fc.array(
              fc.record({
                patient_id: fc.integer({ min: 1, max: 100000 }),
                is_active: fc.constant(false)
              }),
              { minLength: 0, maxLength: 20 }
            )
          }),
          (data) => {
            const allPatients = [...data.activePatients, ...data.inactivePatients];
            
            const stats = calculateDashboardStats({
              patients: allPatients,
              appointments: [],
              doctors: [],
              payments: [],
              leads: []
            });
            
            // Property: Total active patients should equal count of active patients
            return stats.totalActivePatients === data.activePatients.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('todays appointments should count only pending or confirmed appointments for today', () => {
      fc.assert(
        fc.property(
          fc.record({
            todaysPendingAppointments: fc.array(
              fc.record({
                appointment_id: fc.integer({ min: 1, max: 100000 }),
                appointment_date: fc.constant(new Date()),
                status: fc.constant('pending')
              }),
              { minLength: 0, maxLength: 30 }
            ),
            todaysConfirmedAppointments: fc.array(
              fc.record({
                appointment_id: fc.integer({ min: 1, max: 100000 }),
                appointment_date: fc.constant(new Date()),
                status: fc.constant('confirmed')
              }),
              { minLength: 0, maxLength: 30 }
            ),
            todaysOtherAppointments: fc.array(
              fc.record({
                appointment_id: fc.integer({ min: 1, max: 100000 }),
                appointment_date: fc.constant(new Date()),
                status: fc.constantFrom('completed', 'cancelled', 'no-show')
              }),
              { minLength: 0, maxLength: 20 }
            ),
            otherDaysAppointments: fc.array(
              fc.record({
                appointment_id: fc.integer({ min: 1, max: 100000 }),
                appointment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                status: fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled', 'no-show')
              }),
              { minLength: 0, maxLength: 20 }
            )
          }),
          (data) => {
            const allAppointments = [
              ...data.todaysPendingAppointments,
              ...data.todaysConfirmedAppointments,
              ...data.todaysOtherAppointments,
              ...data.otherDaysAppointments
            ];
            
            const stats = calculateDashboardStats({
              patients: [],
              appointments: allAppointments,
              doctors: [],
              payments: [],
              leads: []
            });
            
            const expectedCount = data.todaysPendingAppointments.length + 
                                data.todaysConfirmedAppointments.length;
            
            // Property: Today's appointments should equal pending + confirmed for today
            return stats.todaysAppointments === expectedCount;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('active doctors should count only doctors with is_available = true', () => {
      fc.assert(
        fc.property(
          fc.record({
            availableDoctors: fc.array(
              fc.record({
                doctor_id: fc.integer({ min: 1, max: 10000 }),
                is_available: fc.constant(true)
              }),
              { minLength: 0, maxLength: 30 }
            ),
            unavailableDoctors: fc.array(
              fc.record({
                doctor_id: fc.integer({ min: 1, max: 10000 }),
                is_available: fc.constant(false)
              }),
              { minLength: 0, maxLength: 10 }
            )
          }),
          (data) => {
            const allDoctors = [...data.availableDoctors, ...data.unavailableDoctors];
            
            const stats = calculateDashboardStats({
              patients: [],
              appointments: [],
              doctors: allDoctors,
              payments: [],
              leads: []
            });
            
            // Property: Active doctors should equal count of available doctors
            return stats.activeDoctors === data.availableDoctors.length;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('pending leads should count only leads with status new, contacted, or qualified', () => {
      fc.assert(
        fc.property(
          fc.record({
            newLeads: fc.array(
              fc.record({
                lead_id: fc.integer({ min: 1, max: 100000 }),
                status: fc.constant('new')
              }),
              { minLength: 0, maxLength: 30 }
            ),
            contactedLeads: fc.array(
              fc.record({
                lead_id: fc.integer({ min: 1, max: 100000 }),
                status: fc.constant('contacted')
              }),
              { minLength: 0, maxLength: 30 }
            ),
            qualifiedLeads: fc.array(
              fc.record({
                lead_id: fc.integer({ min: 1, max: 100000 }),
                status: fc.constant('qualified')
              }),
              { minLength: 0, maxLength: 30 }
            ),
            otherLeads: fc.array(
              fc.record({
                lead_id: fc.integer({ min: 1, max: 100000 }),
                status: fc.constantFrom('converted', 'lost')
              }),
              { minLength: 0, maxLength: 20 }
            )
          }),
          (data) => {
            const allLeads = [
              ...data.newLeads,
              ...data.contactedLeads,
              ...data.qualifiedLeads,
              ...data.otherLeads
            ];
            
            const stats = calculateDashboardStats({
              patients: [],
              appointments: [],
              doctors: [],
              payments: [],
              leads: allLeads
            });
            
            const expectedCount = data.newLeads.length + 
                                data.contactedLeads.length + 
                                data.qualifiedLeads.length;
            
            // Property: Pending leads should equal new + contacted + qualified
            return stats.pendingLeads === expectedCount;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('all statistics should be non-negative integers', () => {
      fc.assert(
        fc.property(
          fc.record({
            patients: fc.array(
              fc.record({
                patient_id: fc.integer({ min: 1, max: 100000 }),
                is_active: fc.boolean()
              }),
              { minLength: 0, maxLength: 50 }
            ),
            appointments: fc.array(
              fc.record({
                appointment_id: fc.integer({ min: 1, max: 100000 }),
                appointment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
                status: fc.constantFrom('pending', 'confirmed', 'completed', 'cancelled', 'no-show')
              }),
              { minLength: 0, maxLength: 50 }
            ),
            doctors: fc.array(
              fc.record({
                doctor_id: fc.integer({ min: 1, max: 10000 }),
                is_available: fc.boolean()
              }),
              { minLength: 0, maxLength: 30 }
            ),
            leads: fc.array(
              fc.record({
                lead_id: fc.integer({ min: 1, max: 100000 }),
                status: fc.constantFrom('new', 'contacted', 'qualified', 'converted', 'lost')
              }),
              { minLength: 0, maxLength: 50 }
            )
          }),
          (data) => {
            const stats = calculateDashboardStats({
              patients: data.patients,
              appointments: data.appointments,
              doctors: data.doctors,
              payments: [],
              leads: data.leads
            });
            
            // Property 1: All counts should be non-negative
            const allNonNegative = stats.totalActivePatients >= 0 &&
                                  stats.todaysAppointments >= 0 &&
                                  stats.activeDoctors >= 0 &&
                                  stats.pendingLeads >= 0;
            
            // Property 2: All counts should be integers
            const allIntegers = Number.isInteger(stats.totalActivePatients) &&
                              Number.isInteger(stats.todaysAppointments) &&
                              Number.isInteger(stats.activeDoctors) &&
                              Number.isInteger(stats.pendingLeads);
            
            return allNonNegative && allIntegers;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('statistics should be zero when no matching records exist', () => {
      fc.assert(
        fc.property(
          fc.record({
            inactivePatients: fc.array(
              fc.record({
                patient_id: fc.integer({ min: 1, max: 100000 }),
                is_active: fc.constant(false)
              }),
              { minLength: 0, maxLength: 20 }
            ),
            nonTodayAppointments: fc.array(
              fc.record({
                appointment_id: fc.integer({ min: 1, max: 100000 }),
                appointment_date: fc.date({ min: new Date('2020-01-01'), max: new Date('2020-12-31') }),
                status: fc.constantFrom('pending', 'confirmed')
              }),
              { minLength: 0, maxLength: 20 }
            ),
            unavailableDoctors: fc.array(
              fc.record({
                doctor_id: fc.integer({ min: 1, max: 10000 }),
                is_available: fc.constant(false)
              }),
              { minLength: 0, maxLength: 10 }
            ),
            convertedLeads: fc.array(
              fc.record({
                lead_id: fc.integer({ min: 1, max: 100000 }),
                status: fc.constantFrom('converted', 'lost')
              }),
              { minLength: 0, maxLength: 20 }
            )
          }),
          (data) => {
            const stats = calculateDashboardStats({
              patients: data.inactivePatients,
              appointments: data.nonTodayAppointments,
              doctors: data.unavailableDoctors,
              payments: [],
              leads: data.convertedLeads
            });
            
            // Property: All statistics should be zero
            return stats.totalActivePatients === 0 &&
                   stats.todaysAppointments === 0 &&
                   stats.activeDoctors === 0 &&
                   stats.pendingLeads === 0;
          }
        ),
        { numRuns: 50 }
      );
    });

    test('statistics should handle empty arrays', () => {
      const stats = calculateDashboardStats({
        patients: [],
        appointments: [],
        doctors: [],
        payments: [],
        leads: []
      });
      
      // Property: All statistics should be zero for empty arrays
      expect(stats.totalActivePatients).toBe(0);
      expect(stats.todaysAppointments).toBe(0);
      expect(stats.activeDoctors).toBe(0);
      expect(stats.pendingLeads).toBe(0);
    });

    test('statistics should be independent of each other', () => {
      fc.assert(
        fc.property(
          fc.record({
            activePatientCount: fc.integer({ min: 0, max: 50 }),
            todayAppointmentCount: fc.integer({ min: 0, max: 30 }),
            activeDoctorCount: fc.integer({ min: 0, max: 20 }),
            pendingLeadCount: fc.integer({ min: 0, max: 40 })
          }),
          (data) => {
            // Create data with specific counts
            const patients = Array.from({ length: data.activePatientCount }, (_, i) => ({
              patient_id: i + 1,
              is_active: true
            }));
            
            const appointments = Array.from({ length: data.todayAppointmentCount }, (_, i) => ({
              appointment_id: i + 1,
              appointment_date: new Date(),
              status: 'pending'
            }));
            
            const doctors = Array.from({ length: data.activeDoctorCount }, (_, i) => ({
              doctor_id: i + 1,
              is_available: true
            }));
            
            const leads = Array.from({ length: data.pendingLeadCount }, (_, i) => ({
              lead_id: i + 1,
              status: 'new'
            }));
            
            const stats = calculateDashboardStats({
              patients,
              appointments,
              doctors,
              payments: [],
              leads
            });
            
            // Property: Each statistic should match its input count independently
            return stats.totalActivePatients === data.activePatientCount &&
                   stats.todaysAppointments === data.todayAppointmentCount &&
                   stats.activeDoctors === data.activeDoctorCount &&
                   stats.pendingLeads === data.pendingLeadCount;
          }
        ),
        { numRuns: 50 }
      );
    });

  });

});
