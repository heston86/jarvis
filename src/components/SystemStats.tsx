import React, { useState, useEffect } from "react";

interface Stats {
  cpu: number;
  memory: number;
  disk: number;
  uptime: string;
}

export default function SystemStats() {
  const [stats, setStats] = useState<Stats>({
    cpu: 0,
    memory: 0,
    disk: 0,
    uptime: "00:00:00",
  });

  useEffect(() => {
    // Simulated stats for now - can be replaced with actual system calls
    const updateStats = () => {
      setStats({
        cpu: Math.floor(Math.random() * 30) + 5,
        memory: Math.floor(Math.random() * 20) + 40,
        disk: 65 + Math.floor(Math.random() * 5),
        uptime: formatUptime(Date.now()),
      });
    };

    updateStats();
    const interval = setInterval(updateStats, 3000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (start: number) => {
    const seconds = Math.floor((Date.now() - start) / 1000) % 60;
    const minutes = Math.floor((Date.now() - start) / 60000) % 60;
    const hours = Math.floor((Date.now() - start) / 3600000);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="panel system-stats">
      <div className="panel-header">
        <span className="panel-icon">⚡</span>
        <span className="panel-title">System Stats</span>
        <button className="refresh-btn">↻</button>
      </div>

      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-label">CPU Usage</div>
          <div className="stat-bar">
            <div
              className="stat-fill cpu"
              style={{ width: `${stats.cpu}%` }}
            ></div>
          </div>
          <div className="stat-value">{stats.cpu}%</div>
        </div>

        <div className="stat-item">
          <div className="stat-label">RAM Usage</div>
          <div className="stat-bar">
            <div
              className="stat-fill memory"
              style={{ width: `${stats.memory}%` }}
            ></div>
          </div>
          <div className="stat-value">{stats.memory}%</div>
        </div>

        <div className="stat-row">
          <div className="stat-box">
            <span className="stat-box-label">CPU</span>
            <span className="stat-box-value">{stats.cpu}%</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-label">Memory</span>
            <span className="stat-box-value">{stats.memory}%</span>
          </div>
          <div className="stat-box">
            <span className="stat-box-label">Disk</span>
            <span className="stat-box-value">{stats.disk}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
