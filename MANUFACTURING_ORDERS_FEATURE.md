# Manufacturing Orders Feature for CNC Kanban

## Overview
The Manufacturing Orders feature allows users to define a complete manufacturing workflow for CNC job cards. Each job can have multiple machines that process the part sequentially according to the manufacturing sequence.

## Features

### 📋 Manufacturing Orders Tab
- **New Tab in Edit Job Card**: Located between "Details" and "History" tabs
- **Sequential Machine Management**: Add machines one by one according to manufacturing sequence
- **Connected to Machine Master**: Pulls active machines from the Machine Master list
- **Real-time Status Tracking**: Track each machine operation's status

### ⚙️ Machine Operations
1. **Add Manufacturing Steps**
   - Select machine from dropdown (linked to Machine Master)
   - Define sequence number (1, 2, 3, etc.)
   - Set estimated duration in minutes
   - Add notes for the operation

2. **Track Status**
   - **Status**: Pending → In Progress → Completed → Skipped
   - **Quality Check**: Pending → Passed → Failed → Rework
   - **Operator Assignment**: Assign specific operators to each step

3. **Edit & Reorder**
   - Edit any manufacturing step
   - Delete steps (Admin only)
   - Reorder manufacturing sequence

### 📊 Dashboard Summary
- Total machines in sequence
- Estimated total production time
- Completed operations count
- In-progress operations count

## Database Schema

### Tables Created

#### `machines`
```sql
- id (UUID, Primary Key)
- machine_name (VARCHAR 255)
- machine_code (VARCHAR 100, UNIQUE)
- machine_type (VARCHAR 50) -- cnc, lathe, mill, drill, grinder, edm, laser
- description (TEXT)
- status (VARCHAR 20) -- active, inactive, maintenance
- created_at, updated_at (TIMESTAMP)
```

#### `manufacturing_orders`
```sql
- id (UUID, Primary Key)
- job_card_id (UUID, Foreign Key → cnc_job_cards)
- machine_id (UUID, Foreign Key → machines)
- order_sequence (INTEGER) -- Position in sequence
- estimated_duration_minutes (INTEGER)
- start_time, end_time (TIMESTAMP)
- status (VARCHAR 20) -- pending, in_progress, completed, skipped
- quality_check_status (VARCHAR 20) -- pending, passed, failed, rework
- notes (TEXT)
- assigned_operator (UUID, Foreign Key → users)
- created_by (UUID, Foreign Key → users)
- created_at, updated_at (TIMESTAMP)
```

#### `manufacturing_order_history`
```sql
- id (UUID, Primary Key)
- manufacturing_order_id (UUID, Foreign Key)
- action_type (VARCHAR 50) -- created, status_changed, etc.
- from_status, to_status (VARCHAR 20)
- user_id (UUID, Foreign Key → users)
- notes (TEXT)
- created_at (TIMESTAMP)
```

## API Endpoints

### Get Manufacturing Orders
```
GET /cnc-jobs/:jobCardId/manufacturing-orders
Returns all manufacturing orders for a job card, sorted by sequence
```

### Add Manufacturing Order
```
POST /cnc-jobs/:jobCardId/manufacturing-orders
Body: {
  machine_id: UUID,
  order_sequence: number,
  estimated_duration_minutes: number,
  notes: string
}
```

### Update Manufacturing Order
```
PUT /cnc-jobs/manufacturing-orders/:orderId
Body: {
  order_sequence?: number,
  estimated_duration_minutes?: number,
  status?: 'pending' | 'in_progress' | 'completed' | 'skipped',
  quality_check_status?: 'pending' | 'passed' | 'failed' | 'rework',
  assigned_operator?: UUID,
  notes?: string
}
```

### Delete Manufacturing Order
```
DELETE /cnc-jobs/manufacturing-orders/:orderId
(Admin only)
```

### Reorder Manufacturing Sequence
```
POST /cnc-jobs/:jobCardId/manufacturing-orders/reorder
Body: {
  orders: [
    { id: UUID, newSequence: number },
    ...
  ]
}
```

## Frontend Components

### ManufacturingOrders.js
Main component for managing manufacturing orders in the job card modal.

**Props:**
- `jobCard`: Current job card object
- `isGuest`: Boolean for guest mode (read-only)
- `isAdmin`: Boolean for admin features

**Features:**
- Summary statistics
- Add/Edit form with dropdown for machine selection
- Status and quality check dropdowns
- Operator assignment
- Delete functionality

## Machine Master Integration

### Existing Machine Master Page
- Location: `/machine-master`
- Allows CRUD operations on machines
- Machines appear in manufacturing orders dropdown

### Seed Machines Script
```bash
node backend/seed-machines.js
```

Creates 8 sample machines:
1. CNC Mill 01 & 02
2. CNC Lathe 01 & 02
3. Drill Press
4. Surface Grinder
5. Wire EDM
6. Laser Cutter

## Usage Workflow

### For Job Card Users
1. **Open Job Card** → Click "Edit Job Card"
2. **Click Manufacturing Tab** → ⚙️ icon in tab bar
3. **Add Manufacturing Steps** → Click "+ Add Manufacturing Step"
4. **Select Machine** → Choose from Machine Master list
5. **Set Sequence** → Order 1, 2, 3, etc.
6. **Track Progress** → Update status as work progresses

### For Operators/Production Team
1. View assigned manufacturing steps
2. Update status and quality checks
3. Track time spent on each machine
4. Log issues with quality check failures

### For Administrators
1. Manage machines via Machine Master
2. Create manufacturing sequences for jobs
3. Monitor production timelines
4. Approve rework requests
5. Delete/modify sequences as needed

## UI/UX Features

### Color Coding by Status
- 🟡 **Pending**: Orange (#f59e0b)
- 🔵 **In Progress**: Blue (#3b82f6)
- 🟢 **Completed**: Green (#10b981)
- ⚫ **Skipped**: Gray (#9ca3af)

### Quality Status Colors
- ⚪ **Pending**: Gray (#d1d5db)
- 🟢 **Passed**: Green (#10b981)
- 🔴 **Failed**: Red (#ef4444)
- 🟡 **Rework**: Orange (#f59e0b)

### Responsive Design
- Grid layout adapts to screen size
- Mobile-friendly forms
- Touch-friendly dropdowns

## Performance Considerations

1. **Indexes** on frequently queried columns:
   - `manufacturing_orders.job_card_id`
   - `manufacturing_orders.machine_id`
   - `manufacturing_orders.status`
   - `manufacturing_orders.order_sequence`

2. **Triggers** for automatic column updates:
   - `updated_at` on status changes
   - History logging on status transitions

3. **Batch Operations**:
   - Reorder endpoint handles multiple sequences in one call
   - Efficient lookups with proper indexing

## Permissions

### View (All Users)
- Read manufacturing orders
- View status and quality checks

### Edit (Non-Guest Users)
- Add manufacturing orders
- Update status and quality checks
- Assign operators
- Edit notes

### Delete (Admin Only)
- Delete manufacturing orders
- Reorder sequences

### Create (All Non-Guest)
- Create new manufacturing orders for assigned jobs

## Future Enhancements

1. **Time Tracking**
   - Automatic time logging
   - Performance metrics
   - SLA tracking

2. **Notifications**
   - Alert when step completes
   - Quality check failures
   - Operator assignment alerts

3. **Reporting**
   - Production timeline reports
   - Machine utilization charts
   - Quality check summary

4. **Integration**
   - Connect to IoT machines
   - Automated status updates
   - Real-time production dashboard

5. **Advanced Features**
   - Parallel machine support
   - Alternative routes
   - Production bottleneck analysis

## Migration Script

Applied migration: `manufacturing-orders-migration.sql`
- Creates all required tables
- Adds indexes for performance
- Creates triggers for audit logging
- Handles updates automatically

Run migration:
```bash
node backend/apply-manufacturing-migration.js
```

## Testing

### Sample Data
Run the seed script to create test machines:
```bash
node backend/seed-machines.js
```

### Test Scenarios
1. Create job card with multiple manufacturing steps
2. Change status from pending to in-progress
3. Log quality check failure and trigger rework
4. Assign operators to machines
5. Reorder manufacturing sequence
6. Verify history tracking
7. Test with guest user (read-only access)

## Support

For issues or feature requests related to Manufacturing Orders:
1. Check if machines are active in Machine Master
2. Verify job card is not marked as completed
3. Ensure user role has appropriate permissions
4. Check browser console for detailed errors
