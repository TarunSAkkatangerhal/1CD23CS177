const express = require("express");
const axios = require("axios");
const { logger, requestLogger } = require("../logging-middleware/index");

const app = express();
const SERVICE = "vehicle-scheduler";
const PORT = 3001;

const API_BASE = "http://20.244.56.144/evaluation-service";
const AUTH_TOKEN = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJNYXBDbGFpbXMiOnsiYXVkIjoiaHR0cDovLzIwLjI0NC41Ni4xNDQvZXZhbHVhdGlvbi1zZXJ2aWNlIiwiZW1haWwiOiJ0YXJ1bi4yM2NzZUBjYW1icmlkZ2UuZWR1LmluIiwiZXhwIjoxNzgyNzE0OTc5LCJpYXQiOjE3ODI3MTQwNzksImlzcyI6IkFmZm9yZCBNZWRpY2FsIFRlY2hub2xvZ2llcyBQcml2YXRlIExpbWl0ZWQiLCJqdGkiOiJjMmE0ODA3ZS0wMDc4LTQxNTctYjExNy0wNmY1M2UwZTcyYmEiLCJsb2NhbGUiOiJlbi1JTiIsIm5hbWUiOiJ0YXJ1biBha2thdGFuZ2VyaGFsIiwic3ViIjoiYjBlMmVjNjktMTg1MC00NTJhLTg5ZWMtZGJmNjYzOWM2YmQ5In0sImVtYWlsIjoidGFydW4uMjNjc2VAY2FtYnJpZGdlLmVkdS5pbiIsIm5hbWUiOiJ0YXJ1biBha2thdGFuZ2VyaGFsIiwicm9sbE5vIjoiMWNkMjNjczE3NyIsImFjY2Vzc0NvZGUiOiJBcG5wVG0iLCJjbGllbnRJRCI6ImIwZTJlYzY5LTE4NTAtNDUyYS04OWVjLWRiZjY2MzljNmJkOSIsImNsaWVudFNlY3JldCI6Inlqckh5Ym5ncHpLckpmeloifQ.J__KEE07xTfDytSDcHpYfDSfCwwxe2YiNSFQU9IV4B8";  // 👈 put your token here

app.use(express.json());
app.use(requestLogger(SERVICE));

function knapsack(vehicles, maxHours) {
  const n = vehicles.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(maxHours + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = vehicles[i - 1];
    for (let w = 0; w <= maxHours; w++) {
      dp[i][w] = dp[i - 1][w];
      if (Duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - Duration] + Impact);
      }
    }
  }

  const selected = [];
  let w = maxHours;
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(vehicles[i - 1]);
      w -= vehicles[i - 1].Duration;
    }
  }

  return { maxImpact: dp[n][maxHours], selectedVehicles: selected };
}

app.get("/schedule", async (req, res) => {
  try {
    logger.info(SERVICE, "Fetching depots and vehicles from API");

    const headers = { Authorization: AUTH_TOKEN };

    const [depotsRes, vehiclesRes] = await Promise.all([
      axios.get(`${API_BASE}/depots`, { headers }),
      axios.get(`${API_BASE}/vehicles`, { headers }),
    ]);

    const depots = depotsRes.data.depots;
    const vehicles = vehiclesRes.data.vehicles;

    logger.info(SERVICE, `Fetched ${depots.length} depots, ${vehicles.length} vehicles`);

    const results = depots.map((depot) => {
      logger.info(SERVICE, `Running scheduler for depot ${depot.ID}`, {
        mechanicHours: depot.MechanicHours,
      });

      const { maxImpact, selectedVehicles } = knapsack(vehicles, depot.MechanicHours);

      logger.info(SERVICE, `Depot ${depot.ID} result`, {
        maxImpact,
        selectedCount: selectedVehicles.length,
        totalDuration: selectedVehicles.reduce((s, v) => s + v.Duration, 0),
      });

      return {
        depotID: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        maxImpactAchieved: maxImpact,
        totalHoursUsed: selectedVehicles.reduce((s, v) => s + v.Duration, 0),
        selectedVehicles,
      };
    });

    res.json({ success: true, results });
  } catch (err) {
    logger.error(SERVICE, "Failed to run schedule", { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  logger.info(SERVICE, `Vehicle Scheduler running on port ${PORT}`);
  console.log(`Vehicle Scheduler running on http://localhost:${PORT}`);
});