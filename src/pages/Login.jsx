import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fn = mode === 'in' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) return setMsg({ err: true, text: error.message });
    if (mode === 'up' && !data.session)
      setMsg({ err: false, text: 'Check your inbox and confirm your email, then sign in here.' });
  }

  return (
    <div className="center-screen">
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="col" style={{ marginBottom: 8 }}>
          <span className="muted">Expense tracker</span>
          <h1 className="title">{mode === 'in' ? 'Welcome back' : 'Create your account'}</h1>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {msg && <div className={msg.err ? 'error' : 'lime-note'}>{msg.text}</div>}
        <button className="btn" disabled={busy}>{busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Sign up'}</button>
        <button type="button" className="btn secondary" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'First time? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
