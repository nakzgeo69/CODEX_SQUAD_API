const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ===== PASTEBIN CONFIG URL =====
// Replace with your actual Pastebin RAW URL
const PASTEBIN_CONFIG_URL = 'https://pastebin.com/raw/V5xWLwFL';

// ===== CONFIG CACHE =====
let cachedConfig = null;
let configLoaded = false;

// ===== FETCH CONFIG FROM PASTEBIN =====
async function fetchConfigFromPastebin() {
    try {
        console.log('📡 Fetching config from Pastebin...');
        const response = await axios.get(PASTEBIN_CONFIG_URL, { 
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });
        
        // Parse the config
        const config = response.data;
        let parsedConfig;
        
        if (typeof config === 'string') {
            try {
                parsedConfig = JSON.parse(config);
            } catch {
                // If it's just the API key as plain text
                parsedConfig = { geminiApiKey: config.trim() };
            }
        } else {
            parsedConfig = config;
        }
        
        cachedConfig = {
            geminiApiKey: parsedConfig.geminiApiKey || parsedConfig.apiKey || null,
            model: parsedConfig.model || 'gemini-3.5-flash'
        };
        
        configLoaded = true;
        console.log('✅ Config loaded from Pastebin successfully!');
        return true;
    } catch (error) {
        console.error('❌ Failed to fetch config from Pastebin:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Status Text:', error.response.statusText);
        }
        return false;
    }
}

// ===== LOAD CONFIG WITH RETRY =====
async function loadConfig() {
    // Try Pastebin first
    let loaded = await fetchConfigFromPastebin();
    
    // If Pastebin fails, try local config.json as fallback
    if (!loaded) {
        try {
            const configPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                cachedConfig = {
                    geminiApiKey: config.geminiApiKey || config.apiKey || null,
                    model: config.model || 'gemini-3.5-flash'
                };
                configLoaded = true;
                console.log('✅ Loaded API key from local config.json (fallback)');
                return;
            }
        } catch (error) {
            console.warn('⚠️ Failed to load local config:', error.message);
        }
    }
    
    // If still no config, try environment variable
    if (!cachedConfig || !cachedConfig.geminiApiKey) {
        const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (envKey) {
            cachedConfig = {
                geminiApiKey: envKey,
                model: process.env.GEMINI_MODEL || 'gemini-3.5-flash'
            };
            configLoaded = true;
            console.log('✅ Loaded API key from environment variable');
        }
    }
    
    if (!cachedConfig || !cachedConfig.geminiApiKey) {
        console.error(`
╔══════════════════════════════════════════════════════════════╗
║  ❌ ERROR: API Key Not Found                                 ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Please add your API key to Pastebin:                       ║
║  1. Go to https://pastebin.com                              ║
║  2. Paste your config.json                                 ║
║  3. Get the RAW URL                                        ║
║  4. Set PASTEBIN_CONFIG_URL in index.js                    ║
║                                                              ║
║  Example config.json:                                       ║
║  {                                                          ║
║    "geminiApiKey": "your_key_here",                        ║
║    "model": "gemini-2.5-flash"                             ║
║  }                                                          ║
║                                                              ║
║  Get your API key from:                                     ║
║  https://aistudio.google.com/api-keys                       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
        `);
    }
}

// ===== GET CONFIG FUNCTION =====
function getConfig() {
    if (!configLoaded) {
        return { geminiApiKey: null, model: 'gemini-3.5-flash' };
    }
    return cachedConfig || { geminiApiKey: null, model: 'gemini-3.5-flash' };
}

// ===== INITIALIZE =====
(async function init() {
    await loadConfig();
})();

// ===== API ROUTES =====
app.get('/api/gemini-vision', async (req, res) => {
    const config = getConfig();
    const geminiVision = require('./api/gemini-vision');
    
    // Pass config to the module
    if (geminiVision.setConfig) {
        geminiVision.setConfig(config);
    }
    req.geminiApiKey = config.geminiApiKey;
    req.geminiModel = config.model;
    
    await geminiVision.onStart({ req, res });
});

// ===== REFRESH CONFIG ENDPOINT =====
app.post('/api/config/refresh', async (req, res) => {
    const loaded = await fetchConfigFromPastebin();
    if (loaded) {
        res.json({ success: true, message: 'Config refreshed from Pastebin' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to refresh config' });
    }
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
    const config = getConfig();
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        apiKeyConfigured: !!config.geminiApiKey,
        model: config.model,
        configSource: configLoaded ? 'pastebin' : 'none'
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
    console.error('Server Error:', err.stack);
    res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
});

// ===== START =====
app.listen(PORT, () => {
    const config = getConfig();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║              GEMINI VISION API SERVER                        ║
╠══════════════════════════════════════════════════════════════╣
║  🚀 Server running on port: ${PORT}                              ║
║  🌐 Home:            http://localhost:${PORT}/                  ║
║  🤖 Gemini Vision:   http://localhost:${PORT}/api/gemini-vision ║
║  📊 Health:          http://localhost:${PORT}/api/health       ║
╠══════════════════════════════════════════════════════════════╣
║  🔒 API Key:         ${config.geminiApiKey ? '✅ Configured' : '❌ Missing'}    ║
║  📦 Model:           ${config.model}                                    ║
║  📡 Config Source:   Pastebin (RAW URL)                               ║
║  🔐 Security:        API key stored server-side only            ║
║  🔄 Refresh:         POST /api/config/refresh                   ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
