const express = require('express');
const { agentRegistry } = require('../../gemini');
const pool = require('../../database');
const router = express.Router();
const ensureAdmin = require('../middlewares/ensureAdmin');


const { MariaDBChatHistory } = require('../modules/MariaDBHistory');

//  routes will go here
router.get('/', ensureAdmin, async (req, res) => {
  const adminId = req.session.admin.id;

  // Get all sessions for this admin, most recent first
  const [sessions] = await pool.execute(
    `SELECT id, title, created_at FROM chat_sessions
     WHERE admin_id = ? ORDER BY created_at DESC`,
    [adminId]
  );

  // Active session comes from ?session= query param
  let activeSessionId = req.query.session ? parseInt(req.query.session) : null;

  // If no session specified, default to the most recent one
  if (!activeSessionId && sessions.length > 0) {
    activeSessionId = sessions[0].id;
  }

  // Load messages for the active session
  let messages = [];
  if (activeSessionId) {
    const history = new MariaDBChatHistory(activeSessionId);
    const msgs = await history.getMessages();
    messages = msgs.map(m => ({
      text: m.content,
      role: m._getType() === 'human' ? 'user' : 'bot',
      side: m._getType() === 'human' ? 'right' : 'left',
      chart: m.chartConfig || null,
    }));
  }

  res.render('chat', {
    admin: req.session.admin,
    sessions,           // all conversations for the sidebar
    activeSessionId,    // which one is currently open
    history: messages   // messages for the active session
  });
});

// Create a new chat session
router.post('/sessions', ensureAdmin, express.json(), async (req, res) => {
  try {
    const adminId = req.session.admin.id;
    const title = new Date().toLocaleString();

    const [result] = await pool.execute(
      'INSERT INTO chat_sessions (admin_id, title) VALUES (?, ?)',
      [adminId, title]
    );

    res.status(201).json({ sessionId: result.insertId });
  } catch (error) {
    console.error('Error creating chat session:', error);
    res.status(500).json({ error: 'Failed to create chat session.' });
  }
});

// Delete a chat session and all its messages
router.post('/sessions/:id/delete', ensureAdmin, async (req, res) => {
  const adminId = req.session.admin.id;
  await pool.execute(
    `DELETE FROM chat_sessions WHERE id = ? AND admin_id = ?`,
    [req.params.id, adminId]
  );
  agentRegistry.remove(req.params.id);
  res.json({ success: true });
});

async function sessionBelongsToAdmin(sessionId, adminId) {
  const [sessions] = await pool.execute(
    'SELECT id FROM chat_sessions WHERE id = ? AND admin_id = ?',
    [sessionId, adminId]
  );
  return sessions.length > 0;
}

router.post('/api', ensureAdmin, express.json(), async (req, res) => {
  try {
    const { message, sessionId: requestedSessionId, thinking } = req.body || {};
    const text = (message || '').toString().trim();
    if (!text) return res.json({ reply: 'Please type something.' });

    const sessionId = Number(requestedSessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ reply: 'A valid chat session is required.', chart: null });
    }

    if (!(await sessionBelongsToAdmin(sessionId, req.session.admin.id))) {
      return res.status(404).json({ reply: 'Chat session not found.', chart: null });
    }

    const output = await agentRegistry.get(sessionId).respond({ message: text, thinking });
    res.json(output);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ reply: 'Sorry, something went wrong.' });
  }
});


// Base class for Server-Sent Events (SSE) responses
class SSEFrameWriter {
  constructor(res) {
    this.res = res;
  }

  // Set standard SSE response headers and flush them
  init() {
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.flushHeaders();
  }

  write(frame) {
    this.res.write(`event: ${frame.event}\n`);
    this.res.write(`data: ${JSON.stringify(frame.data)}\n\n`);
  }
}

// Streaming version of POST /api: same request body, but the response is a
// Server-Sent Events stream instead of one JSON object
router.post('/api/stream', ensureAdmin, express.json(), async (req, res) => {
  const { message, sessionId: requestedSessionId, thinking } = req.body || {};
  const text = (message || '').toString().trim();

  // Validate BEFORE starting the stream, so these still come back as plain JSON
  if (!text) return res.json({ reply: 'Please type something.' });
  const sessionId = Number(requestedSessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ reply: 'No session selected.' });
  }

  if (!(await sessionBelongsToAdmin(sessionId, req.session.admin.id))) {
    return res.status(404).json({ reply: 'Chat session not found.', chart: null });
  }

  const writer = new SSEFrameWriter(res);
  writer.init();
  try {
    await agentRegistry.get(sessionId).stream({ message: text, thinking }, writer);
  } catch (error) {
    console.error('Chat stream error:', error);
  } finally {
    res.end();
  }
});

module.exports = router;
