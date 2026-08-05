const http = require('http');
const app = require('./src/app');
const db = require('./src/config/database');
const { initSocket } = require('./src/utils/socket');
const { initDatabaseSchema } = require('./src/config/initDatabase');
require('dotenv').config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Verify MySQL connection
    await db.query('SELECT 1');
    console.log('Database connected successfully.');

    // Initialize database tables and columns sequentially
    await initDatabaseSchema();

    // Create HTTP Server & initialize Socket.io WebSocket for Real-time Connection
    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(`  EduTrack SMS Backend API Server running on port ${PORT}`);
      console.log(`  Real-time Socket.io WebSockets Enabled ⚡`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`  Health Check: http://localhost:${PORT}/api/health`);
      console.log(`===================================================`);
    });
  } catch (err) {
    console.error('Failed to start server due to DB connection error:', err.message);
    console.log('Ensure MySQL is running on localhost:3306 and run "npm run seed" if database is not created.');
    process.exit(1);
  }
}

startServer();
