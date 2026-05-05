import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, setToken, getToken, clearToken } from './services/api.js';

const categories = ['Food', 'Transport', 'Shopping', 'Entertainment', 'Bills', 'Health', 'Study', 'Other'];

function currency(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value || 0));
}

function formatDate(dateString) {
  if (!dateString) return '';
  return String(dateString).slice(0, 10);
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const data = await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-hero">
          <div className="logo-badge">EM</div>
          <h1>Expense Management System</h1>
          <p>A React single-page application with user authentication, MySQL CRUD operations, live search, activity tracking, and an admin panel.</p>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="tab-row">
            <button type="button" className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>Login</button>
            <button type="button" className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => setMode('register')}>Register</button>
          </div>

          {mode === 'register' && (
            <label>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" />
            </label>
          )}

          <label>
            Email
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
          </label>

          <label>
            Password
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
          </label>

          {error && <p className="error-box">{error}</p>}

          <button className="primary-btn" disabled={loading}>{loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create account'}</button>
          <p className="hint">Demo admin can be created from <code>server/.env</code> using ADMIN_EMAIL and ADMIN_PASSWORD.</p>
        </form>
      </section>
    </main>
  );
}

function Layout({ user, onLogout, activePage, setActivePage, children }) {
  const menu = ['Dashboard', 'Expenses', 'Activities'];
  if (user.role === 'admin') menu.push('Admin Panel');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="logo-badge small">EM</div>
          <div>
            <h2>Expense Manager</h2>
            <p>React + Node + MySQL</p>
          </div>
        </div>

        <nav className="nav-list">
          {menu.map((item) => (
            <button key={item} className={activePage === item ? 'nav-item active' : 'nav-item'} onClick={() => setActivePage(item)}>{item}</button>
          ))}
        </nav>

        <div className="profile-card">
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <span className="role-pill">{user.role}</span>
          <button className="secondary-btn" onClick={onLogout}>Logout</button>
        </div>
      </aside>
      <main className="content-area">{children}</main>
    </div>
  );
}

function Dashboard({ expenses }) {
  const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const categoryTotals = useMemo(() => {
    const map = {};
    expenses.forEach((item) => { map[item.category] = (map[item.category] || 0) + Number(item.amount); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const monthlyTotals = useMemo(() => {
    const map = {};
    expenses.forEach((item) => {
      const month = formatDate(item.expense_date).slice(0, 7);
      map[month] = (map[month] || 0) + Number(item.amount);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
  }, [expenses]);

  const topCategory = categoryTotals[0]?.[0] || 'None';
  const maxCategory = categoryTotals[0]?.[1] || 1;
  const maxMonth = monthlyTotals.reduce((max, [, value]) => Math.max(max, value), 1);

  return (
    <section>
      <Header title="Dashboard" subtitle="Overview of spending behaviour and expense patterns." />
      <section className="stats-grid">
        <StatCard label="Total Spending" value={currency(total)} />
        <StatCard label="Total Records" value={expenses.length} />
        <StatCard label="Top Category" value={topCategory} />
      </section>

      <section className="grid-2">
        <div className="panel">
          <h3>Category Summary</h3>
          {categoryTotals.length === 0 && <p className="muted">No expense records yet.</p>}
          {categoryTotals.map(([category, value]) => (
            <ProgressRow key={category} label={category} value={currency(value)} width={(value / maxCategory) * 100} />
          ))}
        </div>
        <div className="panel">
          <h3>Monthly Trend</h3>
          {monthlyTotals.length === 0 && <p className="muted">No monthly data yet.</p>}
          {monthlyTotals.map(([month, value]) => (
            <ProgressRow key={month} label={month} value={currency(value)} width={(value / maxMonth) * 100} />
          ))}
        </div>
      </section>
    </section>
  );
}

function ExpensesPage({ expenses, refreshExpenses, user }) {
  const emptyForm = { title: '', category: 'Food', amount: '', expense_date: '', description: '' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const filtered = expenses.filter((item) => {
    const text = `${item.title} ${item.category} ${item.description || ''} ${item.user_name || ''}`.toLowerCase();
    const matchesSearch = !search || text.includes(search.toLowerCase());
    const matchesCategory = category === 'All' || item.category === category;
    return matchesSearch && matchesCategory;
  });

  function startEdit(expense) {
    setEditingId(expense.id);
    setForm({
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
      expense_date: formatDate(expense.expense_date),
      description: expense.description || ''
    });
    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
    setError('');
  }

  async function saveExpense(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const endpoint = editingId ? `/expenses/${editingId}` : '/expenses';
      const method = editingId ? 'PUT' : 'POST';
      await api(endpoint, { method, body: JSON.stringify(form) });
      await refreshExpenses();
      resetForm();
      setMessage(editingId ? 'Expense updated successfully.' : 'Expense added successfully.');
    } catch (err) {
      setError(err.message || 'Failed to save expense.');
    }
  }

  async function deleteExpense(id) {
    if (!window.confirm('Delete this expense record?')) return;
    setError('');
    setMessage('');
    try {
      await api(`/expenses/${id}`, { method: 'DELETE' });
      await refreshExpenses();
      setMessage('Expense deleted successfully.');
    } catch (err) {
      setError(err.message || 'Failed to delete expense.');
    }
  }

  return (
    <section>
      <Header title="Expenses" subtitle="Create, read, update, delete, search and filter expense records." />
      <section className="grid-form-list">
        <form className="panel form-panel" onSubmit={saveExpense}>
          <h3>{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
          <label>Date<input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></label>
          <label>Description<textarea rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          {error && <p className="error-box">{error}</p>}
          {message && <p className="success-box">{message}</p>}
          <div className="button-row">
            <button className="primary-btn">{editingId ? 'Update' : 'Add'}</button>
            {editingId && <button type="button" className="secondary-btn" onClick={resetForm}>Cancel</button>}
          </div>
        </form>

        <div className="panel">
          <div className="toolbar">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Live search expenses..." />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>All</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="expense-list">
            {filtered.map((expense) => (
              <article className="expense-card" key={expense.id}>
                <div>
                  <h3>{expense.title}</h3>
                  <p className="muted">{expense.category} · {currency(expense.amount)} · {formatDate(expense.expense_date)}</p>
                  {user.role === 'admin' && <p className="muted">Owner: {expense.user_name}</p>}
                  <p>{expense.description || 'No description provided.'}</p>
                </div>
                <div className="button-row">
                  <button className="small-btn" onClick={() => startEdit(expense)}>Edit</button>
                  <button className="small-btn danger" onClick={() => deleteExpense(expense.id)}>Delete</button>
                </div>
              </article>
            ))}
            {filtered.length === 0 && <p className="empty-state">No matching expense records.</p>}
          </div>
        </div>
      </section>
    </section>
  );
}

function ActivitiesPage() {
  const [activities, setActivities] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/activities/me').then(setActivities).catch((err) => setError(err.message));
  }, []);

  return (
    <section>
      <Header title="My Activities" subtitle="A personal log of login and CRUD operations." />
      <div className="panel">
        {error && <p className="error-box">{error}</p>}
        <ActivityTable activities={activities} />
      </div>
    </section>
  );
}

function AdminPanel() {
  const [tab, setTab] = useState('Users');
  const [users, setUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: 'User12345!', role: 'user' });
  const [error, setError] = useState('');

  async function loadAdminData() {
    try {
      const [u, a, e] = await Promise.all([
        api('/admin/users'),
        api('/admin/activities'),
        api('/admin/expenses')
      ]);
      setUsers(u);
      setActivities(a);
      setExpenses(e);
    } catch (err) {
      setError(err.message || 'Failed to load admin data.');
    }
  }

  useEffect(() => { loadAdminData(); }, []);

  async function createUser(event) {
    event.preventDefault();
    setError('');
    try {
      await api('/admin/users', { method: 'POST', body: JSON.stringify(newUser) });
      setNewUser({ name: '', email: '', password: 'User12345!', role: 'user' });
      await loadAdminData();
    } catch (err) { setError(err.message); }
  }

  async function updateUser(user) {
    setError('');
    try {
      await api(`/admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify(user) });
      await loadAdminData();
    } catch (err) { setError(err.message); }
  }

  async function deleteUser(id) {
    if (!window.confirm('Delete this user and their related expenses?')) return;
    setError('');
    try {
      await api(`/admin/users/${id}`, { method: 'DELETE' });
      await loadAdminData();
    } catch (err) { setError(err.message); }
  }

  return (
    <section>
      <Header title="Admin Panel" subtitle="Manage users and review activities across the system." />
      <div className="tab-row admin-tabs">
        {['Users', 'Activities', 'All Expenses'].map((item) => <button key={item} className={tab === item ? 'tab active' : 'tab'} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {error && <p className="error-box">{error}</p>}
      {tab === 'Users' && (
        <div className="panel">
          <form className="admin-create-form" onSubmit={createUser}>
            <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
            <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            <input placeholder="Initial password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}><option>user</option><option>admin</option></select>
            <button className="primary-btn">Create User</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{users.map((u) => <EditableUserRow key={u.id} user={u} onSave={updateUser} onDelete={deleteUser} />)}</tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'Activities' && <div className="panel"><ActivityTable activities={activities} showUser /></div>}
      {tab === 'All Expenses' && (
        <div className="panel table-wrap">
          <table><thead><tr><th>Title</th><th>User</th><th>Category</th><th>Amount</th><th>Date</th></tr></thead><tbody>{expenses.map((e) => <tr key={e.id}><td>{e.title}</td><td>{e.user_name}</td><td>{e.category}</td><td>{currency(e.amount)}</td><td>{formatDate(e.expense_date)}</td></tr>)}</tbody></table>
        </div>
      )}
    </section>
  );
}

function EditableUserRow({ user, onSave, onDelete }) {
  const [draft, setDraft] = useState(user);
  useEffect(() => setDraft(user), [user]);

  return (
    <tr>
      <td><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
      <td>{draft.email}</td>
      <td><select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}><option>user</option><option>admin</option></select></td>
      <td><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option>active</option><option>disabled</option></select></td>
      <td className="button-row"><button className="small-btn" onClick={() => onSave(draft)}>Save</button><button className="small-btn danger" onClick={() => onDelete(user.id)}>Delete</button></td>
    </tr>
  );
}

function ActivityTable({ activities, showUser = false }) {
  if (!activities.length) return <p className="empty-state">No activity records yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{showUser && <th>User</th>}<th>Action</th><th>Entity</th><th>Description</th><th>Time</th></tr></thead>
        <tbody>{activities.map((a) => <tr key={a.id}>{showUser && <td>{a.user_name || 'Deleted user'}</td>}<td>{a.action}</td><td>{a.entity_type || '-'}</td><td>{a.description}</td><td>{new Date(a.created_at).toLocaleString()}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Header({ title, subtitle }) {
  return <header className="page-header"><div><p className="eyebrow">Expense Management</p><h1>{title}</h1><p>{subtitle}</p></div></header>;
}

function StatCard({ label, value }) {
  return <article className="stat-card"><p>{label}</p><strong>{value}</strong></article>;
}

function ProgressRow({ label, value, width }) {
  return <div className="progress-row"><div><span>{label}</span><strong>{value}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(width, 100)}%` }} /></div></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [activePage, setActivePage] = useState('Dashboard');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refreshExpenses() {
    const data = await api('/expenses');
    setExpenses(data);
  }

  useEffect(() => {
    async function loadUser() {
      const token = getToken();
      if (!token) { setLoading(false); return; }
      try {
        const data = await api('/auth/me');
        setUser(data.user);
        await refreshExpenses();
      } catch (error) {
        clearToken();
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  async function handleAuth(authUser) {
    setUser(authUser);
    await refreshExpenses();
  }

  async function handleLogout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch (error) {}
    clearToken();
    setUser(null);
    setExpenses([]);
    setActivePage('Dashboard');
  }

  if (loading) return <div className="loading-screen">Loading application...</div>;
  if (!user) return <AuthScreen onAuth={handleAuth} />;

  return (
    <Layout user={user} onLogout={handleLogout} activePage={activePage} setActivePage={setActivePage}>
      {activePage === 'Dashboard' && <Dashboard expenses={expenses} />}
      {activePage === 'Expenses' && <ExpensesPage expenses={expenses} refreshExpenses={refreshExpenses} user={user} />}
      {activePage === 'Activities' && <ActivitiesPage />}
      {activePage === 'Admin Panel' && user.role === 'admin' && <AdminPanel />}
    </Layout>
  );
}

createRoot(document.getElementById('root')).render(<App />);
