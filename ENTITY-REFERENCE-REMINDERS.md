# Entity Reference System for Reminders

## Overview

The reminders system now supports linking reminders to specific entities (patients, doctors, appointments, leads, payments) or keeping them as general reminders.

## Database Schema

### New Fields Added to `reminders` Table

```sql
entity_type ENUM('patient', 'doctor', 'appointment', 'lead', 'payment', 'general') DEFAULT 'general'
entity_id INT DEFAULT NULL
entity_name VARCHAR(255) DEFAULT NULL
```

### Indexes

- `idx_entity_type` - Fast filtering by entity type
- `idx_entity_id` - Fast lookup by entity ID
- `idx_entity_type_id` - Composite index for combined queries

## Usage Examples

### 1. General Reminder (Not Linked)

```json
{
  "type": "System Maintenance",
  "purpose": "Check server backups",
  "reminderTime": "09:00",
  "recurrence": "daily",
  "entityType": "general",
  "entityId": null,
  "entityName": null
}
```

### 2. Patient Reminder

```json
{
  "type": "Follow-up Call",
  "purpose": "Check on patient recovery after surgery",
  "reminderTime": "14:00",
  "recurrence": "once",
  "entityType": "patient",
  "entityId": 123,
  "entityName": "John Doe"
}
```

### 3. Doctor Reminder

```json
{
  "type": "License Renewal",
  "purpose": "Dr. Smith's medical license expires next month",
  "reminderTime": "10:00",
  "recurrence": "once",
  "entityType": "doctor",
  "entityId": 456,
  "entityName": "Dr. Sarah Smith"
}
```

### 4. Appointment Reminder

```json
{
  "type": "Pre-Appointment Call",
  "purpose": "Confirm appointment with patient",
  "reminderTime": "09:00",
  "recurrence": "once",
  "entityType": "appointment",
  "entityId": 789,
  "entityName": "Appointment #789 - John Doe"
}
```

### 5. Lead Follow-up Reminder

```json
{
  "type": "Lead Follow-up",
  "purpose": "Call potential patient about consultation",
  "reminderTime": "11:00",
  "recurrence": "once",
  "entityType": "lead",
  "entityId": 321,
  "entityName": "Jane Smith (Lead)"
}
```

### 6. Payment Reminder

```json
{
  "type": "Payment Follow-up",
  "purpose": "Follow up on pending payment",
  "reminderTime": "15:00",
  "recurrence": "weekly",
  "entityType": "payment",
  "entityId": 654,
  "entityName": "Payment #654 - John Doe"
}
```

## API Endpoints

### Create Reminder with Entity Reference

```http
POST /api/reminders
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "Follow-up Call",
  "purpose": "Check on patient recovery",
  "reminderTime": "14:00",
  "recurrence": "once",
  "entityType": "patient",
  "entityId": 123,
  "entityName": "John Doe"
}
```

### Update Reminder Entity Reference

```http
PUT /api/reminders/:id
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "Follow-up Call",
  "purpose": "Updated purpose",
  "reminderTime": "15:00",
  "recurrence": "daily",
  "entityType": "patient",
  "entityId": 456,
  "entityName": "Jane Smith"
}
```

### Query Reminders by Entity

```http
GET /api/reminders?entityType=patient&entityId=123
```

## Frontend Integration

### Form Fields

Add these fields to the reminder form:

```jsx
<div className="form-group">
  <label>Link to Entity (Optional)</label>
  <select
    value={formData.entityType}
    onChange={(e) => setFormData({...formData, entityType: e.target.value})}
  >
    <option value="general">General (No Link)</option>
    <option value="patient">Patient</option>
    <option value="doctor">Doctor</option>
    <option value="appointment">Appointment</option>
    <option value="lead">Lead</option>
    <option value="payment">Payment</option>
  </select>
</div>

{formData.entityType !== 'general' && (
  <>
    <div className="form-group">
      <label>Select {formData.entityType}</label>
      <select
        value={formData.entityId}
        onChange={(e) => {
          const selected = entities.find(ent => ent.id === e.target.value);
          setFormData({
            ...formData, 
            entityId: e.target.value,
            entityName: selected?.name
          });
        }}
      >
        <option value="">Select...</option>
        {/* Populate with patients/doctors/etc based on entityType */}
      </select>
    </div>
  </>
)}
```

### Display Entity Link in Table

```jsx
<td>
  {reminder.entity_type !== 'general' && reminder.entity_name ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span className={`entity-badge ${reminder.entity_type}`}>
        {reminder.entity_type}
      </span>
      <span>{reminder.entity_name}</span>
    </div>
  ) : (
    <span style={{ color: '#999' }}>General</span>
  )}
</td>
```

## Migration Steps

1. **Run the migration:**
   ```bash
   cd backend
   node run-entity-reference-migration.js
   ```

2. **Verify the changes:**
   ```sql
   DESCRIBE reminders;
   ```

3. **Test with sample data:**
   ```sql
   INSERT INTO reminders (type, purpose, entity_type, entity_id, entity_name, reminder_time, recurrence, created_by)
   VALUES ('Follow-up', 'Check patient', 'patient', 123, 'John Doe', '14:00', 'once', 1);
   ```

## Benefits

1. **Contextual Reminders**: Link reminders directly to patients, doctors, or other entities
2. **Better Organization**: Filter and view reminders by entity type
3. **Quick Navigation**: Click on entity name to navigate to patient/doctor profile
4. **Flexible**: Can still create general reminders not linked to any entity
5. **Cached Names**: Store entity name for quick display without joins

## Future Enhancements

1. **Auto-populate entity name**: Fetch from related table when entity_id is provided
2. **Entity validation**: Verify entity exists before creating reminder
3. **Cascade updates**: Update entity_name when patient/doctor name changes
4. **Smart filtering**: Show only relevant reminders on patient/doctor detail pages
5. **Bulk operations**: Create reminders for multiple patients at once

