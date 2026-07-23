module.exports = {
    apps: [
        {
            name: "tasks-bot",
            script: "./dist/main.js",
            instances: 1,
            exec_mode: "cluster",
            env: {
                NODE_ENV: "development",
            },
            env_production: {
                NODE_ENV: "production",
            },
            max_memory_restart: "500M",
            watch: false,
            ignore_watch: ["node_modules", "dist", "logs"],
            log_date_format: "YYYY-MM-DD HH:mm:ss Z",
            max_restarts: 5,
            min_uptime: "10s",
            listen_timeout: 10000,
            kill_timeout: 5000,
            wait_ready: true,
            shutdown_with_message: true,
            args: "",
            cwd: "./",
            autorestart: true,
        },
    ],
};
