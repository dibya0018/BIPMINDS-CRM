/**
 * Validation Middleware
 * 
 * Provides input validation and sanitization for all API endpoints.
 * Uses express-validator for validation rules and sanitize-html for XSS prevention.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */

const { body, validationResult, oneOf } = require('express-validator');
const sanitizeHtml = require('sanitize-html');

/**
 * Sanitize string to prevent XSS attacks
 * Removes all HTML tags and dangerous content
 * 
 * @param {string} value - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeXSS(value) {
  if (typeof value !== 'string') return value;
  
  // First, remove javascript: protocol and other dangerous patterns
  let sanitized = value
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, ''); // Remove event handlers like onclick=, onerror=
  
  // Then remove all HTML tags and dangerous content
  sanitized = sanitizeHtml(sanitized, {
    allowedTags: [], // No HTML tags allowed
    allowedAttributes: {}, // No attributes allowed
    disallowedTagsMode: 'discard' // Remove tags completely
  });
  
  return sanitized;
}

/**
 * Custom sanitizer that removes XSS patterns
 * Can be used with express-validator's customSanitizer
 */
const xssSanitizer = (value) => sanitizeXSS(value);

/**
 * Handle validation errors
 * Returns 400 error with validation details if validation fails
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VAL_001',
        message: 'Validation failed',
        details: errors.array().map(err => ({
          field: err.path || err.param,
          message: err.msg,
          value: err.value
        }))
      }
    });
  }
  
  next();
}

/**
 * Patient validation rules
 * Validates all required and optional patient fields
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */
const validatePatient = [
  // Required fields with trimming and sanitization
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 100 }).withMessage('First name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name must contain only letters and spaces')
    .customSanitizer(xssSanitizer), // XSS sanitization
  
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Last name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name must contain only letters and spaces')
    .customSanitizer(xssSanitizer),
  
  body('dateOfBirth')
    .notEmpty().withMessage('Date of birth is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date of birth must be in YYYY-MM-DD format')
    .isDate().withMessage('Date of birth must be a valid date'),
  
  body('gender')
    .notEmpty().withMessage('Gender is required')
    .isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  
  body('bloodGroup')
    .notEmpty().withMessage('Blood group is required')
    .isIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).withMessage('Invalid blood group'),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9]{10}$/).withMessage('Phone number must be exactly 10 digits'),
  
  // Optional fields with validation
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 }).withMessage('Address must not exceed 500 characters')
    .customSanitizer(xssSanitizer),
  
  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('City must not exceed 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('state')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('State must not exceed 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('zipCode')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Zip code must not exceed 20 characters')
    .customSanitizer(xssSanitizer),
  
  body('emergencyContactName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }).withMessage('Emergency contact name must not exceed 200 characters')
    .customSanitizer(xssSanitizer),
  
  body('emergencyContactPhone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[0-9]{10}$/).withMessage('Emergency contact phone must be exactly 10 digits'),
  
  body('emergencyContactRelation')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 }).withMessage('Emergency contact relation must not exceed 50 characters')
    .customSanitizer(xssSanitizer),
  
  body('medicalHistory')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('allergies')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('currentMedications')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('insuranceProvider')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }).withMessage('Insurance provider must not exceed 200 characters')
    .customSanitizer(xssSanitizer),
  
  body('insuranceNumber')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Insurance number must not exceed 100 characters')
    .customSanitizer(xssSanitizer)
];

/**
 * Appointment validation rules
 * Validates appointment creation and update data
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */
const validateAppointment = [
  body('patientId')
    .notEmpty().withMessage('Patient ID is required')
    .isInt({ min: 1 }).withMessage('Patient ID must be a positive integer'),
  
  body('doctorId')
    .notEmpty().withMessage('Doctor ID is required')
    .isInt({ min: 1 }).withMessage('Doctor ID must be a positive integer'),
  
  body('appointmentDate')
    .notEmpty().withMessage('Appointment date is required')
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Appointment date must be in YYYY-MM-DD format')
    .isDate().withMessage('Appointment date must be a valid date'),
  
  body('appointmentTime')
    .notEmpty().withMessage('Appointment time is required')
    .matches(/^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/).withMessage('Appointment time must be in HH:MM:SS format'),
  
  body('appointmentType')
    .notEmpty().withMessage('Appointment type is required')
    .isIn(['consultation', 'follow-up', 'emergency', 'surgery', 'checkup']).withMessage('Invalid appointment type'),
  
  body('reason')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('durationMinutes')
    .optional({ checkFalsy: true })
    .isInt({ min: 5, max: 480 }).withMessage('Duration must be between 5 and 480 minutes')
];

/**
 * Doctor validation rules
 * Validates doctor profile creation and update data
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */
const validateDoctor = [
  // userId is required for doctor creation
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isInt({ min: 1 }).withMessage('User ID must be a positive integer'),
  
  // User creation fields (validated conditionally)
  body('email')
    .optional({ checkFalsy: true })
    .isEmail().withMessage('Email must be a valid email address')
    .normalizeEmail(),
  
  body('password')
    .optional({ checkFalsy: true })
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  
  body('firstName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('First name must be between 2 and 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('lastName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Last name must be between 2 and 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 }).withMessage('Phone must not exceed 20 characters')
    .customSanitizer(xssSanitizer),
  
  body('gender')
    .optional({ checkFalsy: true })
    .isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  
  body('profilePicture')
    .optional({ checkFalsy: true })
    .customSanitizer(xssSanitizer),
  
  body('specialization')
    .trim()
    .notEmpty().withMessage('Specialization is required')
    .isLength({ min: 2, max: 200 }).withMessage('Specialization must be between 2 and 200 characters')
    .customSanitizer(xssSanitizer),
  
  body('qualification')
    .trim()
    .notEmpty().withMessage('Qualification is required')
    .customSanitizer(xssSanitizer),
  
  body('licenseNumber')
    .trim()
    .notEmpty().withMessage('License number is required')
    .isLength({ max: 100 }).withMessage('License number must not exceed 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('experienceYears')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 70 }).withMessage('Experience years must be between 0 and 70'),
  
  body('consultationFee')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Consultation fee must be a positive number'),
  
  body('department')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Department must not exceed 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('location')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Location must not exceed 100 characters')
    .customSanitizer(xssSanitizer),
  
  body('languagesKnown')
    .optional({ checkFalsy: true }),
  
  body('displayInList')
    .optional({ checkFalsy: true })
    .isBoolean().withMessage('Display in list must be a boolean'),
  
  body('isAvailable')
    .optional({ checkFalsy: true })
    .isBoolean().withMessage('Is available must be a boolean'),
  
  body('maxPatientsPerDay')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100 }).withMessage('Max patients per day must be between 1 and 100'),
  
  body('bio')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer)
];

/**
 * Payment validation rules
 * Validates payment creation and update data
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */
const validatePayment = [
  body('patientId')
    .notEmpty().withMessage('Patient ID is required')
    .isInt({ min: 1 }).withMessage('Patient ID must be a positive integer'),
  
  body('amount')
    .notEmpty().withMessage('Amount is required')
    .isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['cash', 'card', 'upi', 'insurance', 'bank-transfer']).withMessage('Invalid payment method'),
  
  body('appointmentId')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 }).withMessage('Appointment ID must be a positive integer'),
  
  body('taxAmount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Tax amount must be a positive number'),
  
  body('discountAmount')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 }).withMessage('Discount amount must be a positive number'),
  
  body('description')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('transactionId')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 }).withMessage('Transaction ID must not exceed 100 characters')
    .customSanitizer(xssSanitizer)
];

/**
 * Lead validation rules
 * Validates lead creation and update data with UTM tracking support
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10
 */
const validateLead = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 100 }).withMessage('First name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('First name must contain only letters and spaces')
    .customSanitizer(xssSanitizer),
  
  body('lastName')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Last name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/).withMessage('Last name must contain only letters and spaces')
    .customSanitizer(xssSanitizer),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^[0-9]{10}$/).withMessage('Phone number must be exactly 10 digits'),
  
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),
  
  body('source')
    .notEmpty().withMessage('Source is required')
    .isIn(['website', 'facebook', 'google', 'instagram', 'referral', 'walk-in', 'other']).withMessage('Invalid source'),
  
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['new', 'contacted', 'qualified', 'converted', 'lost']).withMessage('Invalid status'),
  
  body('priority')
    .optional({ checkFalsy: true })
    .isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
  
  body('interestedIn')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 }).withMessage('Interested in must not exceed 200 characters')
    .customSanitizer(xssSanitizer),
  
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .customSanitizer(xssSanitizer),
  
  body('followUpDate')
    .optional({ checkFalsy: true })
    .matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Follow up date must be in YYYY-MM-DD format')
    .isDate().withMessage('Follow up date must be a valid date'),
  
  // UTM Tracking Parameters (all optional)
  body('utmSource')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('UTM source must not exceed 255 characters')
    .customSanitizer(xssSanitizer),
  
  body('utmMedium')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('UTM medium must not exceed 255 characters')
    .customSanitizer(xssSanitizer),
  
  body('utmCampaign')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('UTM campaign must not exceed 255 characters')
    .customSanitizer(xssSanitizer),
  
  body('utmTerm')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('UTM term must not exceed 255 characters')
    .customSanitizer(xssSanitizer),
  
  body('utmContent')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('UTM content must not exceed 255 characters')
    .customSanitizer(xssSanitizer),
  
  body('gclid')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Google Click ID must not exceed 255 characters')
    .customSanitizer(xssSanitizer),
  
  body('fbclid')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 255 }).withMessage('Facebook Click ID must not exceed 255 characters')
    .customSanitizer(xssSanitizer)
];

module.exports = {
  validatePatient,
  validateAppointment,
  validateDoctor,
  validatePayment,
  validateLead,
  handleValidationErrors
};
