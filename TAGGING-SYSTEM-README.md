# Independent Tagging System

A flexible, reusable tagging system for BipzyCRM that can be used across all entities (patients, doctors, appointments, etc.).

## Features

✅ **Independent Tags Table** - Single source of truth for all tags
✅ **JSON-based Tag Assignment** - Efficient storage using MySQL JSON columns
✅ **Stored Procedures** - Business logic in database for consistency
✅ **Autocomplete Search** - Fast tag search with usage statistics
✅ **Elasticsearch-Ready** - Optional Elasticsearch integration for advanced search
✅ **Create Tags On-the-Fly** - Users can create new tags while assigning
✅ **Usage Tracking** - Automatic usage count for popular tags
✅ **Color Coding** - Visual tag identification with custom colors
✅ **WebSocket Integration** - Real-time updates when tags change

## Database Schema

### Tags Table
```sql
CREATE TABLE tags (
    tag_id INT AUTO_INCREMENT PRIMARY KEY,
    tag_name VARCHAR(100) NOT NULL UNIQUE,
    tag_color VARCHAR(7) DEFAULT '#80399a',
    description TEXT,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT,
    INDEX idx_tag_name (tag_name),
    INDEX idx_usage_count (usage_count)
);
```

### Patient Tags (JSON Column)
```sql
ALTER TABLE patients 
ADD COLUMN tags JSON DEFAULT NULL;
```

## Installation

### 1. Run Migration

```bash
cd backend
node run-tags-migration.js
```

This will:
- Create the `tags` table
- Add `tags` JSON column to `patients` table
- Create 4 stored procedures
- Insert 8 default tags

### 2. Restart Backend Server

```bash
npm start
```

### 3. (Optional) Setup Elasticsearch

For advanced search capabilities:

```bash
# Install Elasticsearch
# https://www.elastic.co/downloads/elasticsearch

# Install Node.js client
npm install @elastic/elasticsearch

# Add to .env
ELASTICSEARCH_URL=http://localhost:9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=your_password

# Uncomment Elasticsearch code in backend/utils/elasticsearch.js
```

## API Endpoints

### Tag Management

```http
GET    /api/tags                    # Get all tags
GET    /api/tags/search?q=VIP       # Search tags (autocomplete)
POST   /api/tags                    # Create new tag
PUT    /api/tags/:id                # Update tag
DELETE /api/tags/:id                # Delete tag
```

### Patient Tag Assignment

```http
POST   /api/tags/patients/:patientId           # Assign tag to patient
DELETE /api/tags/patients/:patientId/:tagId    # Remove tag from patient
GET    /api/tags/patients/:patientId           # Get patient tags
```

## Usage Examples

### 1. Assign Existing Tag to Patient

```javascript
POST /api/tags/patients/123
{
  "tagName": "VIP",
  "tagColor": "#FF6B6B"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "tagId": 1,
    "isNewTag": false,
    "patientTags": [
      {
        "tag_id": 1,
        "tag_name": "VIP",
        "tag_color": "#FF6B6B",
        "usage_count": 5
      }
    ]
  },
  "message": "Tag assigned successfully"
}
```

### 2. Create and Assign New Tag

```javascript
POST /api/tags/patients/123
{
  "tagName": "High Priority",
  "tagColor": "#FF0000"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "tagId": 15,
    "isNewTag": true,
    "patientTags": [...]
  },
  "message": "New tag created and assigned"
}
```

### 3. Search Tags (Autocomplete)

```javascript
GET /api/tags/search?q=vip&limit=10
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "tag_id": 1,
      "tag_name": "VIP",
      "tag_color": "#FF6B6B",
      "usage_count": 5,
      "description": "VIP patients requiring special attention"
    }
  ]
}
```

### 4. Remove Tag from Patient

```javascript
DELETE /api/tags/patients/123/1
```

## Frontend Integration

### Using TagInput Component

```jsx
import TagInput from '../components/TagInput/TagInput';
import apiService from '../services/apiService';

function PatientForm() {
  const [patientTags, setPatientTags] = useState([]);

  return (
    <div>
      <label>Tags</label>
      <TagInput
        patientId={patient.patient_id}
        initialTags={patientTags}
        onTagsChange={setPatientTags}
        apiService={apiService}
      />
    </div>
  );
}
```

### Features:
- Type `@` to trigger autocomplete
- Arrow keys to navigate suggestions
- Enter to select or create tag
- Click X to remove tag
- Real-time search with debouncing

## Stored Procedures

### sp_AssignPatientTag
Assigns a tag to a patient. Creates tag if it doesn't exist.

```sql
CALL sp_AssignPatientTag(
  patient_id, 
  tag_name, 
  tag_color, 
  user_id, 
  @tag_id, 
  @is_new_tag
);
```

### sp_RemovePatientTag
Removes a tag from a patient and decrements usage count.

```sql
CALL sp_RemovePatientTag(patient_id, tag_id);
```

### sp_GetPatientTags
Gets all tags assigned to a patient.

```sql
CALL sp_GetPatientTags(patient_id);
```

### sp_SearchTags
Searches tags by name with usage-based ranking.

```sql
CALL sp_SearchTags(search_term, limit);
```

## Extending to Other Entities

To add tagging to doctors, appointments, or other entities:

### 1. Add JSON Column

```sql
ALTER TABLE doctors 
ADD COLUMN tags JSON DEFAULT NULL;
```

### 2. Create Stored Procedures

```sql
-- Copy and modify sp_AssignPatientTag
CREATE PROCEDURE sp_AssignDoctorTag(...)
-- Similar logic for doctors
```

### 3. Add API Endpoints

```javascript
// In backend/routes/tags.js
router.post('/doctors/:doctorId', assignTagToDoctor);
router.delete('/doctors/:doctorId/:tagId', removeTagFromDoctor);
router.get('/doctors/:doctorId', getDoctorTags);
```

### 4. Update Frontend Component

```jsx
<TagInput
  entityType="doctor"
  entityId={doctor.doctor_id}
  initialTags={doctorTags}
  onTagsChange={setDoctorTags}
  apiService={apiService}
/>
```

## Default Tags

The migration includes 8 default tags:

1. **VIP** (#FF6B6B) - VIP patients requiring special attention
2. **Regular** (#4ECDC4) - Regular patients
3. **Follow-up Required** (#FFD93D) - Patients requiring follow-up
4. **Chronic Condition** (#95E1D3) - Patients with chronic conditions
5. **Emergency Contact** (#F38181) - Emergency contact required
6. **Insurance Pending** (#AA96DA) - Insurance verification pending
7. **Payment Plan** (#FCBAD3) - On payment plan
8. **Referral** (#A8D8EA) - Referred by another doctor

## Performance Considerations

### MySQL JSON Performance
- JSON columns are indexed for fast searches
- Usage count helps prioritize popular tags
- Stored procedures minimize round trips

### Elasticsearch (Optional)
- Fuzzy matching for typo tolerance
- Edge n-gram for prefix matching
- Boosted scoring for relevance
- Sub-second search response

### Caching Strategy
- Cache popular tags in Redis
- Invalidate on tag updates
- TTL: 5 minutes

## Security

- All endpoints require authentication
- Permission checks: `patients:read`, `patients:update`
- XSS sanitization on tag names
- SQL injection protection via parameterized queries
- Audit logging for all tag operations

## Troubleshooting

### Migration Fails
```bash
# Check if tables exist
mysql -u root -p hospital_crm -e "SHOW TABLES LIKE 'tags';"

# Drop and recreate if needed
mysql -u root -p hospital_crm < backend/database/migrations/create_tags_system.sql
```

### Tags Not Showing
```bash
# Check if tags column exists
mysql -u root -p hospital_crm -e "SHOW COLUMNS FROM patients LIKE 'tags';"

# Check stored procedures
mysql -u root -p hospital_crm -e "SHOW PROCEDURE STATUS WHERE Name LIKE 'sp_%Tag%';"
```

### Elasticsearch Not Working
```bash
# Check if Elasticsearch is running
curl http://localhost:9200

# Check logs
tail -f backend/logs/combined.log | grep Elasticsearch
```

## Future Enhancements

- [ ] Tag categories/groups
- [ ] Tag permissions (who can create/assign)
- [ ] Tag analytics dashboard
- [ ] Bulk tag operations
- [ ] Tag templates
- [ ] Tag synonyms
- [ ] Tag hierarchies (parent/child)
- [ ] Tag expiration dates
- [ ] Tag notifications

## Support

For issues or questions:
1. Check logs: `backend/logs/combined.log`
2. Verify migration: `node run-tags-migration.js`
3. Test API: Use Postman/curl
4. Check database: MySQL Workbench

## License

Part of BipzyCRM - Hospital CRM System
