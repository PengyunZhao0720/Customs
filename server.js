const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./qna.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the Q&A database.');
  initDatabase();
});

function initDatabase() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      section TEXT NOT NULL,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      question_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES questions(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(question_id, user_id)
    )`);

    const checkUsers = db.prepare("SELECT COUNT(*) as count FROM users");
    checkUsers.get((err, row) => {
      if (err) {
        console.error(err.message);
        return;
      }
      if (row.count === 0) {
        const insertUser = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
        const hashedPassword = bcrypt.hashSync('admin123', 8);
        insertUser.run('admin', hashedPassword, 'teacher', (err) => {
          if (!err) {
            console.log('Default admin user created: admin / admin123');
          }
        });
        insertUser.finalize();
      }
    });
    checkUsers.finalize();
  });
}

app.post('/api/register', (req, res) => {
  const { username, password, role } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 8);

  db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hashedPassword, role],
    function(err) {
      if (err) {
        return res.status(400).json({ error: "Username already exists" });
      }
      res.json({ id: this.lastID, username, role });
    }
  );
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json({ id: user.id, username: user.username, role: user.role });
  });
});

app.get('/api/questions', (req, res) => {
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

  if (section) {
    query += " AND q.section = ?";
    params.push(section);
  }
  if (category) {
    query += " AND q.category = ?";
    params.push(category);
  }
  if (search) {
    query += " AND (q.title LIKE ? OR q.content LIKE ?)";
    params.push(`%${search}%`, `%${search}%`);
  }

  query += " ORDER BY q.created_at DESC";

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/questions/:id', (req, res) => {
  const questionId = req.params.id;

  db.get(`
    SELECT q.*, u.username, u.role 
    FROM questions q 
    JOIN users u ON q.user_id = u.id 
    WHERE q.id = ?`,
    [questionId],
    (err, question) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }

      db.all(`
        SELECT a.*, u.username, u.role 
        FROM answers a 
        JOIN users u ON a.user_id = u.id 
        WHERE a.question_id = ? 
        ORDER BY a.created_at`,
        [questionId],
        (err, answers) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ question, answers });
        }
      );
    }
  );
});

app.post('/api/questions', (req, res) => {
  const { title, content, category, user_id, section } = req.body;

  db.run("INSERT INTO questions (title, content, category, user_id, section) VALUES (?, ?, ?, ?, ?)",
    [title, content, category, user_id, section],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, title, content, category, user_id, section });
    }
  );
});

app.put('/api/questions/:id', (req, res) => {
  const { title, content, category, status, user_id } = req.body;
  const questionId = req.params.id;

  db.get("SELECT * FROM questions WHERE id = ?", [questionId], (err, question) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }
    if (question.user_id !== user_id && req.body.role !== 'teacher') {
      return res.status(403).json({ error: "Not authorized" });
    }

    db.run("UPDATE questions SET title = ?, content = ?, category = ?, status = ? WHERE id = ?",
      [title, content, category, status, questionId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      }
    );
  });
});

app.delete('/api/questions/:id', (req, res) => {
  const { user_id, role } = req.body;
  const questionId = req.params.id;

  db.get("SELECT * FROM questions WHERE id = ?", [questionId], (err, question) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }
    if (question.user_id !== user_id && role !== 'teacher') {
      return res.status(403).json({ error: "Not authorized" });
    }

    db.run("DELETE FROM answers WHERE question_id = ?", [questionId]);
    db.run("DELETE FROM notifications WHERE question_id = ?", [questionId]);
    db.run("DELETE FROM follows WHERE question_id = ?", [questionId]);
    db.run("DELETE FROM questions WHERE id = ?", [questionId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    });
  });
});

app.post('/api/questions/:id/answers', (req, res) => {
  const { content, user_id } = req.body;
  const questionId = req.params.id;

  db.run("INSERT INTO answers (content, question_id, user_id) VALUES (?, ?, ?)",
    [content, questionId, user_id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      db.get("SELECT user_id FROM questions WHERE id = ?", [questionId], (err, question) => {
        if (!err && question && question.user_id !== user_id) {
          db.run("INSERT INTO notifications (user_id, question_id, message) VALUES (?, ?, ?)",
            [question.user_id, questionId, "您的问题收到了新回答"]);
        }
      });

      res.json({ id: this.lastID, content, question_id: questionId, user_id });
    }
  );
});

app.post('/api/questions/:id/follow', (req, res) => {
  const { user_id } = req.body;
  const questionId = req.params.id;

  db.run("INSERT OR IGNORE INTO follows (question_id, user_id) VALUES (?, ?)",
    [questionId, user_id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

app.delete('/api/questions/:id/follow', (req, res) => {
  const { user_id } = req.body;
  const questionId = req.params.id;

  db.run("DELETE FROM follows WHERE question_id = ? AND user_id = ?",
    [questionId, user_id],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ success: true });
    }
  );
});

app.get('/api/notifications/:user_id', (req, res) => {
  const userId = req.params.user_id;

  db.all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

app.put('/api/notifications/:id/read', (req, res) => {
  db.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.get('/api/users', (req, res) => {
  const { role } = req.query;
  let query = "SELECT id, username, role, created_at FROM users";
  const params = [];
  
  if (role) {
    query += " WHERE role = ?";
    params.push(role);
  }
  
  query += " ORDER BY created_at DESC";

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.delete('/api/users/:id', (req, res) => {
  db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
