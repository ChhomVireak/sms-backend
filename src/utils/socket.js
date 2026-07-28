const { Server } = require('socket.io');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:4200',
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    console.log(`⚡ [Realtime] New client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`⚡ [Realtime] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    console.warn('⚠️ [Realtime] Socket.io not initialized yet.');
  }
  return io;
}

function notifyRealtime(event, payload) {
  if (io) {
    io.emit(event, payload);
    console.log(`📡 [Realtime Broadcast] Event: '${event}'`, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  notifyRealtime
};
