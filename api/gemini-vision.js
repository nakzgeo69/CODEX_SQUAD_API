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

// Store config from server
let serverConfig = { geminiApiKey: null, model: 'gemini-2.5-flash' };

function setConfig(config) {
  if (config) {
    serverConfig = config;
  }
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
      status: false,
      error: 'Both "prompt" and "uid" parameters are required',
      example: '/api/gemini-vision?prompt=hello&uid=123'
    });
  }

  // Get API key from request or server config
  const apiKey = req.geminiApiKey || serverConfig.geminiApiKey;
  
  // 🔥 FIXED: Use only valid Gemini model names
  let model = req.geminiModel || serverConfig.model || 'gemini-2.5-flash';
  
  // 🔥 FIXED: Map deprecated model names to valid ones
  const modelMap = {
    'gemini-vision': 'gemini-2.5-flash',
    'gemini-pro-vision': 'gemini-2.5-flash',
    'gemini-2.5-pro': 'gemini-2.5-flash',
    'gemini-2.5-flash-lite': 'gemini-2.5-flash'
  };
  
  if (modelMap[model]) {
    console.log(`⚠️ Model "${model}" is deprecated. Using "${modelMap[model]}" instead.`);
    model = modelMap[model];
  }

  // 🔥 FIXED: List of valid models
  const validModels = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ];
  
  if (!validModels.includes(model)) {
    console.log(`⚠️ Invalid model "${model}". Using default "gemini-2.5-flash".`);
    model = 'gemini-2.5-flash';
  }

  if (!apiKey) {
    return res.status(500).json({
      status: false,
      error: 'API key not configured. Please check your Pastebin config.',
      fix: 'Make sure your Pastebin RAW URL is correct and contains the API key'
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
      try {
        const imageResp = await axios.get(imgUrl, { 
          responseType: 'arraybuffer',
          timeout: 10000
        });
        imageData = Buffer.from(imageResp.data, 'binary').toString('base64');
      } catch (imgError) {
        return res.status(400).json({
          status: false,
          error: 'Failed to fetch image from URL',
          details: imgError.message
        });
      }
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
        role: msg.role === 'model' ? 'model' : 'user',
        parts: msg.parts
      }))
    };

    // 🔥 FIXED: Use the correct API endpoint with proper model
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    console.log(`📡 Using model: ${model}`);
    console.log(`📡 API URL: ${apiUrl}`);

    // Send request to Gemini API
    const response = await axios.post(
      apiUrl,
      payload,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    // Extract response text
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 
                 response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 
                 "Sorry, I couldn't generate a response.";

    // Save AI response into memory
    conversation.push({ role: 'model', parts: [{ text }] });
    saveConversation(uid, conversation);

    res.json({
      status: true,
      response: text,
      conversationId: uid,
      modelUsed: model
    });

  } catch (error) {
    console.error('Gemini Vision Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    let errorMessage = 'Failed to get response from Gemini Vision API';
    let statusCode = 500;
    
    if (error.response?.status === 403) {
      errorMessage = 'Invalid API key or API key does not have access to Gemini Vision. Please check your API key.';
      statusCode = 403;
    } else if (error.response?.status === 429) {
      errorMessage = 'Rate limit exceeded. Please try again later.';
      statusCode = 429;
    } else if (error.response?.status === 404) {
      errorMessage = `Model "${model}" not found. Please use a valid model name.`;
      statusCode = 404;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout. Please try again.';
      statusCode = 408;
    }

    res.status(statusCode).json({
      status: false,
      error: errorMessage,
      model: model,
      details: error.response?.data?.error?.message || error.message
    });
  }
}

module.exports = { meta, onStart, setConfig };
