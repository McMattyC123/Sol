/** @type {import('pm2').StartOptions[]} */
module.exports = {
  apps: [
    {
      name: 'sol-wash-sim',
      script: 'src/worker.js',
      cwd: __dirname,
      interpreter: 'node',
      max_restarts: 100,
      min_uptime: '5s',
      exp_backoff_restart_delay: 2000,
      error_file: 'logs/worker-error.log',
      out_file: 'logs/worker-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
