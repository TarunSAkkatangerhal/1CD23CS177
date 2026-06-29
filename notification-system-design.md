# Notification System Design

## Stage 1

This document describes the REST API endpoints and real-time communication required for the Notification System. The system allows students to receive notifications, manage them, and get instant updates without refreshing the application.

---

# Notification REST APIs

## 1. Get All Notifications

Retrieves all notifications for a specific student.

### Endpoint

```http
GET /api/notifications/:studentId
```

### Request Headers

```http
Authorization: Bearer <JWT_TOKEN>
```

### Sample Response

```json
{
  "studentId": "1042",
  "notifications": [
    {
      "id": "uuid",
      "type": "Placement",
      "message": "CSX hiring drive is now open.",
      "isRead": false,
      "createdAt": "2026-04-22T17:51:18Z"
    },
    {
      "id": "uuid",
      "type": "Event",
      "message": "AI Workshop starts tomorrow at 10:00 AM.",
      "isRead": true,
      "createdAt": "2026-04-20T10:15:00Z"
    }
  ]
}
```

### Description

* Returns all notifications associated with the given student.
* Notifications are typically sorted by newest first.
* Each notification includes its type, message, read status, and creation timestamp.

---

## 2. Mark a Notification as Read

Marks a single notification as read after the student views it.

### Endpoint

```http
PATCH /api/notifications/:notificationId/read
```

### Sample Response

```json
{
  "success": true,
  "notificationId": "uuid"
}
```

### Description

* Updates the selected notification.
* Changes the `isRead` field from `false` to `true`.
* No other notification is affected.

---

## 3. Mark All Notifications as Read

Marks every unread notification of a student as read.

### Endpoint

```http
PATCH /api/notifications/:studentId/read-all
```

### Sample Response

```json
{
  "success": true,
  "updatedCount": 12
}
```

### Description

* Marks all unread notifications for the student as read.
* Returns the total number of notifications updated.

---

## 4. Delete a Notification

Deletes a notification permanently.

### Endpoint

```http
DELETE /api/notifications/:notificationId
```

### Sample Response

```json
{
  "success": true
}
```

### Description

* Removes the selected notification from the database.
* The deleted notification will no longer appear in the notification list.

---

# Real-Time Notification System

To provide instant updates, the application uses **Socket.IO**.

Whenever a new notification is created, the backend immediately sends it to the intended student without requiring a page refresh.

## Server-Side Implementation

```javascript
io.to(`student_${studentId}`).emit("new_notification", {
    id,
    type,
    message,
    createdAt
});
```

### Event Payload

```json
{
  "id": "uuid",
  "type": "Placement",
  "message": "CSX hiring drive is now open.",
  "createdAt": "2026-04-22T17:51:18Z"
}
```

---

## Client-Side Workflow

1. The student logs into the application.
2. The client establishes a Socket.IO connection.
3. The client joins the student's notification room.
4. The frontend listens for the `new_notification` event.
5. Whenever the server emits a new notification, it is displayed instantly in the notification panel.

Example:

```javascript
socket.on("new_notification", (notification) => {
    console.log(notification);
});
```

---

# Overall Workflow

1. A new notification is created by the system (Placement, Event, Announcement, etc.).
2. The notification is stored in the database.
3. The backend emits a `new_notification` event using Socket.IO.
4. The connected student immediately receives the notification.
5. The student can:

   * View all notifications.
   * Mark a notification as read.
   * Mark all notifications as read.
   * Delete unwanted notifications.

---

# Summary

The Notification System provides:

* Secure access using JWT authentication.
* REST APIs for viewing and managing notifications.
* Bulk update functionality to mark all notifications as read.
* Real-time notification delivery using Socket.IO.
* A responsive user experience without requiring manual page refreshes.


## Stage 2

### Database Choice: PostgreSQL

Notifications have a fixed schema. PostgreSQL gives strong indexing, ACID transactions, and handles 50,000 students with millions of rows efficiently using proper indexes.

### Schema

```sql
CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TYPE notification_type AS ENUM ('Placement', 'Result', 'Event');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Queries

Fetch unread notifications:
```sql
SELECT * FROM notifications
WHERE student_id = $1 AND is_read = false
ORDER BY created_at DESC;
```

Mark all as read:
```sql
UPDATE notifications SET is_read = true WHERE student_id = $1;
```

### Problems at scale
- Full table scans as rows grow
- Lock contention on mass UPDATE
- Storage bloat without archival

### Solutions
- Add indexes
- Partition table by created_at monthly
- Archive old notifications to cold storage

## Stage 3

### Query Analysis

Original slow query:
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

### Why it is slow
With 5,000,000 rows and no index on studentID, PostgreSQL does a full sequential scan. ORDER BY also requires sorting the entire filtered result set.

### Fix
```sql
CREATE INDEX idx_notifications_student_unread
ON notifications (student_id, is_read, created_at DESC);
```

This satisfies WHERE and ORDER BY without a sort step. Query becomes O(log n) instead of O(n).

### On adding indexes to every column
Bad advice. Indexes slow down every INSERT/UPDATE/DELETE because each index must be updated. With frequent writes, over-indexing hammers write performance. Only index columns in WHERE, JOIN, or ORDER BY on hot queries.

### Placement notifications in last 7 days
```sql
SELECT * FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

Supporting index:
```sql
CREATE INDEX idx_notifications_type_date
ON notifications (type, created_at DESC);
```


## Stage 4

### Problem
DB is queried on every page load for every student causing too many reads and DB overload.

### Solutions

#### 1. Redis Cache (Recommended)
Cache each student's notifications in Redis with TTL of 60 seconds.
- Page load hits Redis first
- Cache miss queries DB and stores result in Redis
- New notification invalidates that student's cache key
- Tradeoff: slight staleness up to TTL seconds

#### 2. Pagination
Never fetch all notifications at once. Use cursor-based pagination:
```sql
SELECT * FROM notifications
WHERE student_id = $1 AND created_at < $cursor
ORDER BY created_at DESC LIMIT 20;
```

#### 3. Read Replicas
Route all reads to a PostgreSQL read replica. Writes go to primary.
Tradeoff: slight replication lag.

#### 4. HTTP Caching Headers
Set `Cache-Control: max-age=30` on API response.
Browser skips re-request within 30 seconds.

### Recommended combination
Redis + Pagination + Read replica for production scale.

## Stage 5

### Problem with current pseudocode
for student_id in student_ids:

send_email(student_id, message)

save_to_db(student_id, message)

push_to_app(student_id, message)
### Shortcomings
- If send_email fails at student 200, remaining 49800 never get notified
- No retry logic
- Email and DB are coupled — inconsistent state on failure
- Synchronous loop over 50,000 students is very slow

### Should email and DB save happen together?
Yes — save to DB first as source of truth, then enqueue email job via message queue. Queue handles retries independently.

### Redesigned Pseudocode
function notify_all(student_ids, message):

// 1. Bulk insert all notifications to DB first

bulk_save_to_db(student_ids, message)
// 2. Enqueue email jobs in batches

for batch in chunks(student_ids, size=500):

enqueue_email_batch(batch, message)
// 3. Broadcast real-time in-app notifications

broadcast_to_all(student_ids, message)
// Worker handles retries separately

function email_worker(batch, message):

for student_id in batch:

try:

send_email(student_id, message)

mark_email_sent(student_id)

catch error:

if retries < 3:

re-enqueue with exponential backoff

else:

log_failed(student_id, error)

### Key improvements
- DB is source of truth before any sending
- Email failures are isolated per job
- Queue provides automatic retry
- Batching makes it fast and parallel

