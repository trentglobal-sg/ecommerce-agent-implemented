const express = require('express');
const { model } = require('../../gemini');
const { BaseChatMessageHistory } = require('@langchain/core/chat_history');
const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { RunnableWithMessageHistory } = require('@langchain/core/runnables');
const pool = require('../../database');
const router = express.Router();
const ensureAdmin = require('../middlewares/ensureAdmin');

// setup for AI Stuff
const { MariaDBChatHistory } = require('../modules/MariaDBHistory');
const { runAgent } = require('../modules/runAgent');

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a helpful admin assistant for an ecommerce store. Format your responses using markdown.'],
  new MessagesPlaceholder('history'),
  ['human', '{input}'],
]);

const chain = prompt.pipe(model);

const chainWithHistory = new RunnableWithMessageHistory({
  runnable: chain,
  getMessageHistory: (sessionId) => new MariaDBChatHistory(sessionId),
  inputMessagesKey: 'input',
  historyMessagesKey: 'history',
});


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
  res.json({ success: true });
});

router.post('/api', ensureAdmin, express.json(), async (req, res) => {
  try {
    const { message, sessionId: requestedSessionId } = req.body || {};
    const text = (message || '').toString().trim();
    if (!text) return res.json({ reply: 'Please type something.' });

    const sessionId = Number(requestedSessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ reply: 'A valid chat session is required.', chart: null });
    }

    const [sessions] = await pool.execute(
      'SELECT id FROM chat_sessions WHERE id = ? AND admin_id = ?',
      [sessionId, req.session.admin.id]
    );
    if (sessions.length === 0) {
      return res.status(404).json({ reply: 'Chat session not found.', chart: null });
    }

    const { reply, chart } = await runAgent(
      { input: text },
      { configurable: { sessionId } }
    );

    res.json({ reply, chart });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ reply: 'Sorry, something went wrong.' });
  }
});


module.exports = router;