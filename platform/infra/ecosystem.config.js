// PM2 process manifest — bare-metal deployment.
// pm2 startOrReload ecosystem.config.js && pm2 save && pm2 startup
//
// All three apps run in cluster mode for CPU parallelism on multi-core boxes.
// Notes specific to exch-api in cluster:
//   • Socket.io uses the Redis adapter (see common/socket/redis-io.adapter.ts)
//     so room broadcasts cross worker boundaries.
//   • Transport is locked to websocket-only (no polling) — long-polling
//     would land successive requests on different workers without sticky
//     sessions and break the handshake.
//   • The roulette game loop holds a Redis lock so only one worker drives
//     it; if that worker dies the TTL expires and another worker takes over.
module.exports = {
  apps: [
    {
      name: "exch-api",
      cwd: "../apps/api",
      script: "dist/main.js",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "512M",
      // Graceful reload: new worker must be ready before old one is killed.
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: { NODE_ENV: "production", API_PORT: 4000, UPLOADS_DIR: "/var/www/exch/uploads" },
    },
    {
      name: "exch-web",
      cwd: "../apps/web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "512M",
      // Rolling reload keeps one worker alive — prevents "connection refused" during deploy.
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 5000,
      env: { NODE_ENV: "production" },
    },
    {
      name: "exch-admin",
      cwd: "../apps/admin",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3001",
      instances: 2,
      exec_mode: "cluster",
      max_memory_restart: "384M",
      wait_ready: true,
      listen_timeout: 15000,
      kill_timeout: 5000,
      env: { NODE_ENV: "production" },
    },
  ],
};
