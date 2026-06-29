const express = require("express");
const axios = require("axios");
const { logger, requestLogger } = require("../logging-middleware/index");

const app = express();
const SERVICE = "notification-app";
const PORT = 3002;

const AUTH_TOKEN = "Bearer yJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJ0YXJ1bi4yM2NzZUBjYW1icmlkZ2UuZWR1LmluIiwiZXhwIjoxNzgyNzE0OTc5LCJpYXQiOjE3ODI3MTQwNzksImlzcyI6IkFmZm9yZCBNZWRpY2FsIFRlY2hub2xvZ2llcyBQcml2YXRlIExpbWl0ZWQiLCJqdGkiOiJjMmE0ODA3ZS0wMDc4LTQxNTctYjExNy0wNmY1M2UwZTcyYmEiLCJsb2NhbGUiOiJlbi1JTiIsIm5hbWUiOiJ0YXJ1biBha2thdGFuZ2VyaGFsIiwic3ViIjoiYjBlMmVjNjktMTg1MC00NTJhLTg5ZWMtZGJmNjYzOWM2YmQ5In0sImVtYWlsIjoidGFydW4uMjNjc2VAY2FtYnJpZGdlLmVkdS5pbiIsIm5hbWUiOiJ0YXJ1biBha2thdGFuZ2VyaGFsIiwicm9sbE5vIjoiMWNkMjNjczE3NyIsImFjY2Vzc0NvZGUiOiJBcG5wVG0iLCJjbGllbnRJRCI6ImIwZTJlYzY5LTE4NTAtNDUyYS04OWVjLWRiZjY2MzljNmJkOSIsImNsaWVudFNlY3JldCI6Inlqckh5Ym5ncHpLckpmeloifQ.J__KEE07xTfDytSDcHpYfDSfCwwxe2YiNSFQU9IV4B8";
const API_BASE = "http://4.224.186.213/evaluation-service";

app.use(express.json());
app.use(requestLogger(SERVICE));

const TYPE_WEIGHT = {
  Placement: 3,
  Result: 2,
  Event: 1,
};

function scoreNotification(notification) {
  const weight = TYPE_WEIGHT[notification.Type] || 0;
  const ageMs = Date.now() - new Date(notification.Timestamp).getTime();
  const recencyBonus = Math.max(0, 999 - Math.floor(ageMs / 60000));
  return weight * 1000 + recencyBonus;
}

app.get("/priority-inbox", async (req, res) => {
  const topN = parseInt(req.query.top) || 10;

  try {
    logger.info(SERVICE, `Fetching notifications for priority inbox`, { topN });

    const response = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: AUTH_TOKEN },
    });

    const notifications = response.data.notifications;
    logger.info(SERVICE, `Fetched ${notifications.length} notifications`);

    const scored = notifications.map((n) => ({
      ...n,
      _score: scoreNotification(n),
    }));

    scored.sort((a, b) => b._score - a._score);

    const topNotifications = scored.slice(0, topN);

    logger.info(SERVICE, `Returning top ${topN} priority notifications`);

    res.json({
      success: true,
      topN,
      total: notifications.length,
      priorityInbox: topNotifications,
    });
  } catch (err) {
    logger.error(SERVICE, "Failed to fetch priority inbox", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/priority-inbox/live", async (req, res) => {
  const topN = parseInt(req.query.top) || 10;

  try {
    logger.info(SERVICE, "Live priority inbox requested", { topN });

    const response = await axios.get(`${API_BASE}/notifications`, {
      headers: { Authorization: AUTH_TOKEN },
    });

    const notifications = response.data.notifications;

    const scored = notifications
      .map((n) => ({ ...n, _score: scoreNotification(n) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, topN);

    logger.info(SERVICE, "Live priority inbox served", {
      total: notifications.length,
      topN,
    });

    res.json({
      success: true,
      topN,
      total: notifications.length,
      priorityInbox: scored,
    });
  } catch (err) {
    logger.error(SERVICE, "Live priority inbox failed", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  logger.info(SERVICE, `Notification App running on port ${PORT}`);
  console.log(`Notification App running on http://localhost:${PORT}`);
});