const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Import Gemini Vision API
const geminiVision = require('./api/gemini-vision');

// ===== API ROUTES =====
app.get('/api/gemini-vision', async (req, res) => {
  await geminiVision.onStart({ req, res });
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ===== SERVE FRONTEND =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== 404 =====
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ===== 500 =====
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

// ===== START =====
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              GEMINI VISION API SERVER                        ║
╠══════════════════════════════════════════════════════════════╣
║  🚀 Server running on port: ${PORT}                              ║
║  🌐 Home:            http://localhost:${PORT}/                  ║
║  🤖 Gemini Vision:   http://localhost:${PORT}/api/gemini-vision ║
║  📊 Health:          http://localhost:${PORT}/api/health       ║
╠══════════════════════════════════════════════════════════════╣
║  🔒 API Key is stored server-side and never exposed          ║
╚══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;