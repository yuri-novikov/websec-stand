module.exports = {
  apps: [
    {
      name: "websec-stand-frontend",
      cwd: "/var/www/websec-stand/frontend",
      script: "yarn",
      args: "dev",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "websec-stand-backend",
      cwd: "/var/www/websec-stand/backend",
      script: "yarn",
      args: "dev",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
