const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');
const path = require('path');
const pool = require('./db');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || 'development_secret_change_me';

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

async function logActivity(userId, action, entityType = null, entityId = null, description = '') {
  await pool.query(
    'INSERT INTO user_activities (id, user_id, action, entity_type, entity_id, description) VALUES (?, ?, ?, ?, ?, ?)',
    [uuidv4(), userId, action, entityType, entityId, description]
  );
}

async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Missing authentication token.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const [users] = await pool.query(
      'SELECT id, name, email, role, status, created_at FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!users.length || users[0].status !== 'active') {
      return res.status(401).json({ message: 'User is not active or no longer exists.' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access is required.' });
  }
  next();
}

function normaliseExpenseRow(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: row.user_name,
    title: row.title,
    category: row.category,
    amount: Number(row.amount),
    expense_date: row.expense_date,
    description: row.description || '',
    created_at: row.created_at
  };
}

function validateExpense(body) {
  const title = String(body.title || '').trim();
  const category = String(body.category || '').trim();
  const amount = Number(body.amount);
  const expenseDate = String(body.expense_date || body.date || '').trim();
  const description = String(body.description || '').trim();

  if (!title) return { error: 'Title is required.' };
  if (!category) return { error: 'Category is required.' };
  if (!amount || amount <= 0) return { error: 'Amount must be greater than 0.' };
  if (!expenseDate) return { error: 'Expense date is required.' };

  return { payload: { title, category, amount, expenseDate, description } };
}

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) {
      return res.status(409).json({ message: 'Email is already registered.' });
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [id, name, email, passwordHash, 'user']
    );
    await logActivity(id, 'REGISTER', 'user', id, `${name} registered a new account.`);

    const user = { id, name, email, role: 'user', status: 'active' };
    res.status(201).json({ token: signToken(user), user });
  } catch (error) {
    res.status(500).json({ message: 'Registration failed.', detail: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!users.length) return res.status(401).json({ message: 'Invalid email or password.' });

    const user = users[0];
    if (user.status !== 'active') return res.status(403).json({ message: 'This account is disabled.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password.' });

    await logActivity(user.id, 'LOGIN', 'user', user.id, `${user.name} logged in.`);

    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status };
    res.json({ token: signToken(safeUser), user: safeUser });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', detail: error.message });
  }
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/logout', authRequired, async (req, res) => {
  await logActivity(req.user.id, 'LOGOUT', 'user', req.user.id, `${req.user.name} logged out.`);
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/expenses', authRequired, async (req, res) => {
  try {
    const params = [];
    let sql = `
      SELECT expense_items.*, users.name AS user_name
      FROM expense_items
      JOIN users ON users.id = expense_items.user_id
    `;

    if (req.user.role !== 'admin') {
      sql += ' WHERE expense_items.user_id = ?';
      params.push(req.user.id);
    }

    sql += ' ORDER BY expense_items.expense_date DESC, expense_items.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows.map(normaliseExpenseRow));
  } catch (error) {
    res.status(500).json({ message: 'Failed to load expenses.', detail: error.message });
  }
});

app.post('/api/expenses', authRequired, async (req, res) => {
  try {
    const { error, payload } = validateExpense(req.body);
    if (error) return res.status(400).json({ message: error });

    const id = uuidv4();
    await pool.query(
      'INSERT INTO expense_items (id, user_id, title, category, amount, expense_date, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.id, payload.title, payload.category, payload.amount, payload.expenseDate, payload.description]
    );
    await logActivity(req.user.id, 'CREATE_EXPENSE', 'expense_item', id, `Created expense: ${payload.title}`);

    res.status(201).json({
      id,
      user_id: req.user.id,
      user_name: req.user.name,
      title: payload.title,
      category: payload.category,
      amount: payload.amount,
      expense_date: payload.expenseDate,
      description: payload.description
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create expense.', detail: error.message });
  }
});

app.put('/api/expenses/:id', authRequired, async (req, res) => {
  try {
    const { error, payload } = validateExpense(req.body);
    if (error) return res.status(400).json({ message: error });

    const [existing] = await pool.query('SELECT * FROM expense_items WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Expense not found.' });
    if (req.user.role !== 'admin' && existing[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only update your own expenses.' });
    }

    await pool.query(
      'UPDATE expense_items SET title = ?, category = ?, amount = ?, expense_date = ?, description = ? WHERE id = ?',
      [payload.title, payload.category, payload.amount, payload.expenseDate, payload.description, req.params.id]
    );
    await logActivity(req.user.id, 'UPDATE_EXPENSE', 'expense_item', req.params.id, `Updated expense: ${payload.title}`);

    res.json({ message: 'Expense updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update expense.', detail: error.message });
  }
});

app.delete('/api/expenses/:id', authRequired, async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT * FROM expense_items WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Expense not found.' });
    if (req.user.role !== 'admin' && existing[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own expenses.' });
    }

    await pool.query('DELETE FROM expense_items WHERE id = ?', [req.params.id]);
    await logActivity(req.user.id, 'DELETE_EXPENSE', 'expense_item', req.params.id, `Deleted expense: ${existing[0].title}`);

    res.json({ message: 'Expense deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete expense.', detail: error.message });
  }
});

app.get('/api/activities/me', authRequired, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT user_activities.*, users.name AS user_name FROM user_activities LEFT JOIN users ON users.id = user_activities.user_id WHERE user_activities.user_id = ? ORDER BY user_activities.created_at DESC LIMIT 100',
    [req.user.id]
  );
  res.json(rows);
});

app.get('/api/admin/users', authRequired, adminRequired, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, role, status, created_at FROM users ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/admin/users', authRequired, adminRequired, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || 'User12345!');
    const role = req.body.role === 'admin' ? 'admin' : 'user';

    if (!name || !email) return res.status(400).json({ message: 'Name and email are required.' });
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(409).json({ message: 'Email already exists.' });

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, name, email, passwordHash, role]);
    await logActivity(req.user.id, 'ADMIN_CREATE_USER', 'user', id, `Admin created user: ${email}`);
    res.status(201).json({ id, name, email, role, status: 'active' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create user.', detail: error.message });
  }
});

app.put('/api/admin/users/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    const status = req.body.status === 'disabled' ? 'disabled' : 'active';
    const name = String(req.body.name || '').trim();

    if (!name) return res.status(400).json({ message: 'Name is required.' });

    await pool.query('UPDATE users SET name = ?, role = ?, status = ? WHERE id = ?', [name, role, status, req.params.id]);
    await logActivity(req.user.id, 'ADMIN_UPDATE_USER', 'user', req.params.id, `Admin updated user: ${req.params.id}`);
    res.json({ message: 'User updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user.', detail: error.message });
  }
});

app.delete('/api/admin/users/:id', authRequired, adminRequired, async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ message: 'Admin cannot delete their own active account.' });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logActivity(req.user.id, 'ADMIN_DELETE_USER', 'user', req.params.id, `Admin deleted user: ${req.params.id}`);
    res.json({ message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user.', detail: error.message });
  }
});

app.get('/api/admin/activities', authRequired, adminRequired, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT user_activities.*, users.name AS user_name, users.email AS user_email
    FROM user_activities
    LEFT JOIN users ON users.id = user_activities.user_id
    ORDER BY user_activities.created_at DESC
    LIMIT 200
  `);
  res.json(rows);
});

app.get('/api/admin/expenses', authRequired, adminRequired, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT expense_items.*, users.name AS user_name, users.email AS user_email
    FROM expense_items
    JOIN users ON users.id = expense_items.user_id
    ORDER BY expense_items.expense_date DESC
  `);
  res.json(rows.map(normaliseExpenseRow));
});

async function ensureDefaultAdmin() {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.ADMIN_PASSWORD || '');
  const adminName = String(process.env.ADMIN_NAME || 'Admin User').trim();

  if (!adminEmail || !adminPassword) return;

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [adminEmail]);
  if (existing.length) return;

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await pool.query(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, adminName, adminEmail, passwordHash, 'admin']
  );
  await logActivity(id, 'SYSTEM_CREATE_ADMIN', 'user', id, `Default admin account created: ${adminEmail}`);
  console.log(`Default admin created: ${adminEmail}`);
}

app.use((req, res) => {
  res.status(404).json({ message: 'API route not found.' });
});

ensureDefaultAdmin()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
