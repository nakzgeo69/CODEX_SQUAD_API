const axios = require('axios');
const fs = require('fs');
const path = require('path');

const meta = {
  name: 'Gemini Vision (Conversational)',
  path: '/gemini-vision',
  method: 'get',
  category: 'ai'
};

const convoFile = path.join(__dirname, '../data/convo.json');

// Ensure conversation file exists
if (!fs.existsSync(convoFile)) {
  fs.writeFileSync(convoFile, JSON.stringify({}), 'utf-8');
}

// Load config to get API key
let config = {};
try {
  const configPath = path.join(__dirname, '../config.json');
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
} catch (error) {
  console.error('Error loading config:', error);
}

function loadConversation(uid) {
  try {
    const convos = JSON.parse(fs.readFileSync(convoFile, 'utf-8'));
    return convos[uid] || [];
  } catch {
    return [];
  }
}

function saveConversation(uid, messages) {
  try {
    const convos = JSON.parse(fs.readFileSync(convoFile, 'utf-8'));
    convos[uid] = messages;
    fs.writeFileSync(convoFile, JSON.stringify(convos, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

function clearConversation(uid) {
  try {
    const convos = JSON.parse(fs.readFileSync(convoFile, 'utf-8'));
    delete convos[uid];
    fs.writeFileSync(convoFile, JSON.stringify(convos, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error clearing conversation:', error);
  }
}

async function onStart({ req, res }) {
  const { prompt, uid, imgUrl, img } = req.query;

  if (!prompt || !uid) {
    return res.status(400).json({
      error: 'Both "prompt" and "uid" parameters are required',
      example: '/api/gemini-vision?prompt=hello&uid=123'
    });
  }

  // Get API key from config (hidden from client)
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'API key not configured. Please set GEMINI_API_KEY in config.json or environment variables.'
    });
  }

  try {
    // Handle "clear" command
    if (prompt.toLowerCase() === "clear") {
      clearConversation(uid);
      return res.json({ 
        status: true, 
        message: "Conversation history cleared.",
        response: "Conversation history cleared. Start a new conversation!"
      });
    }

    // Load existing memory
    let conversation = loadConversation(uid);

    // Prepare image data if available
    let imageData = null;
    if (img) {
      imageData = img;
    } else if (imgUrl) {
      const imageResp = await axios.get(imgUrl, { responseType: 'arraybuffer' });
      imageData = Buffer.from(imageResp.data, 'binary').toString('base64');
    }

    // Build user message
    const parts = [{ text: prompt }];
    if (imageData) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: imageData
        }
      });
    }

    // Add user message to memory
    conversation.push({ role: 'user', parts });

    // Construct payload for Gemini API
    const payload = {
      contents: conversation.map(msg => ({
        role: msg.role,
        parts: msg.parts
      }))
    };

    const model = config.model || 'gemini-2.5-flash';

    // Send request to Gemini API using hidden API key
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      payload,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Content-Type': 'application/json'
        }
      }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";

    // Save AI response into memory
    conversation.push({ role: 'model', parts: [{ text }] });
    saveConversation(uid, conversation);

    res.json({
      status: true,
      response: text,
      conversationId: uid
    });

  } catch (error) {
    console.error('Gemini Vision Error:', error.message);
    res.status(500).json({
      status: false,
      error: 'Failed to get response from Gemini Vision API',
      details: error.message
    });
  }
}

module.exports = { meta, onStart };