const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        section TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS answers (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question_id INTEGER REFERENCES questions(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS follows (
        id SERIAL PRIMARY KEY,
        question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(question_id, user_id)
      )
    `);

    const result = await pool.query("SELECT COUNT(*) as count FROM users");
    if (parseInt(result.rows[0].count) === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 8);
      await pool.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
        ['admin', hashedPassword, 'teacher']
      );
      console.log('Default admin user created: admin / admin123');
    }

    console.log('Connected to the Q&A database.');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  }
}

initDatabase();

app.post('/api/register', async (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);

  try {
    const result = await pool.query(
      "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id",
      [username, hashedPassword, role]
    );
    res.json({ id: result.rows[0].id, username, role });
  } catch (err) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = result.rows[0];
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/questions', async (req, res) => {
  const { section, category, search } = req.query;
  let query = `
    SELECT q.*, u.username, u.role, 
           (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count,
           (SELECT COUNT(*) FROM follows WHERE question_id = q.id) as follow_count
    FROM questions q
    JOIN users u ON q.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (section) {
    query += ` AND q.section = $${paramIndex}`;
    params.push(section);
    paramIndex++;
  }
  if (category) {
    query += ` AND q.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }
  if (search) {
    query += ` AND (q.title ILIKE $${paramIndex} OR q.content ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  query += " ORDER BY q.created_at DESC";

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/questions/:id', async (req, res) => {
  const questionId = req.params.id;

  try {
    const questionResult = await pool.query(`
      SELECT q.*, u.username, u.role 
      FROM questions q 
      JOIN users u ON q.user_id = u.id 
      WHERE q.id = $1`,
      [questionId]
    );
    
    const question = questionResult.rows[0];
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const answersResult = await pool.query(`
      SELECT a.*, u.username, u.role 
      FROM answers a 
      JOIN users u ON a.user_id = u.id 
      WHERE a.question_id = $1 
      ORDER BY a.created_at`,
      [questionId]
    );

    res.json({ question, answers: answersResult.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/questions', async (req, res) => {
  const { title, content, category, user_id, section } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO questions (title, content, category, user_id, section) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [title, content, category, user_id, section]
    );
    res.json({ id: result.rows[0].id, title, content, category, user_id, section });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', async (req, res) => {
  const { title, content, category, status, user_id, role } = req.body;
  const questionId = req.params.id;

  try {
    const questionResult = await pool.query("SELECT * FROM questions WHERE id = $1", [questionId]);
    const question = questionResult.rows[0];
    
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }
    if (question.user_id !== parseInt(user_id) && role !== 'teacher') {
      return res.status(403).json({ error: "Not authorized" });
    }

    await pool.query(
      "UPDATE questions SET title = $1, content = $2, category = $3, status = $4 WHERE id = $5",
      [title, content, category, status, questionId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  const { user_id, role } = req.body;
  const questionId = req.params.id;

  try {
    const questionResult = await pool.query("SELECT * FROM questions WHERE id = $1", [questionId]);
    const question = questionResult.rows[0];
    
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }
    if (question.user_id !== parseInt(user_id) && role !== 'teacher') {
      return res.status(403).json({ error: "Not authorized" });
    }

    await pool.query("DELETE FROM answers WHERE question_id = $1", [questionId]);
    await pool.query("DELETE FROM notifications WHERE question_id = $1", [questionId]);
    await pool.query("DELETE FROM follows WHERE question_id = $1", [questionId]);
    await pool.query("DELETE FROM questions WHERE id = $1", [questionId]);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/questions/:id/answers', async (req, res) => {
  const { content, user_id } = req.body;
  const questionId = req.params.id;

  try {
    const result = await pool.query(
      "INSERT INTO answers (content, question_id, user_id) VALUES ($1, $2, $3) RETURNING id",
      [content, questionId, user_id]
    );
    
    const questionResult = await pool.query("SELECT user_id FROM questions WHERE id = $1", [questionId]);
    const question = questionResult.rows[0];
    
    if (question && question.user_id !== parseInt(user_id)) {
      await pool.query(
        "INSERT INTO notifications (user_id, question_id, message) VALUES ($1, $2, $3)",
        [question.user_id, questionId, "您的问题收到了新回答"]
      );
    }

    res.json({ id: result.rows[0].id, content, question_id: questionId, user_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/questions/:id/follow', async (req, res) => {
  const { user_id } = req.body;
  const questionId = req.params.id;

  try {
    await pool.query(
      "INSERT INTO follows (question_id, user_id) VALUES ($1, $2) ON CONFLICT (question_id, user_id) DO NOTHING",
      [questionId, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id/follow', async (req, res) => {
  const { user_id } = req.body;
  const questionId = req.params.id;

  try {
    await pool.query(
      "DELETE FROM follows WHERE question_id = $1 AND user_id = $2",
      [questionId, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/:user_id', async (req, res) => {
  const userId = req.params.user_id;

  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET is_read = 1 WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  const { role } = req.query;
  let query = "SELECT id, username, role, created_at FROM users";
  const params = [];
  
  if (role) {
    query += " WHERE role = $1";
    params.push(role);
  }
  
  query += " ORDER BY created_at DESC";

  try {
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
