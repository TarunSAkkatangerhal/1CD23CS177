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
