import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { configured, supabase } from './lib/supabase.js';
import { DataProvider, useData } from './store.jsx';
import { BottomNav, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Activity from './pages/Activity.jsx';
import AddEntry from './pages/AddEntry.jsx';
import Insights from './pages/Insights.jsx';
import Investments from './pages/Investments.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured)
    return (
      <div className="center-screen">
        <div className="card" style={{ maxWidth: 360 }}>
          <strong>Not connected to a database yet</strong>
          <span className="small muted">Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see README).</span>
        </div>
      </div>
    );
  if (session === undefined) return <Loading />;
  if (!session) return <Login />;

  return (
    <DataProvider session={session}>
      <Shell />
    </DataProvider>
  );
}

function Shell() {
  const { api, error, reload } = useData();
  if (error)
    return (
      <div className="center-screen">
        <div className="card" style={{ maxWidth: 380 }}>
          <strong>Couldn’t load your data</strong>
          <div className="error">{error}</div>
          <span className="small muted">If this says a table doesn’t exist, run supabase/schema.sql in the Supabase SQL Editor first.</span>
          <button className="btn" onClick={reload}>Try again</button>
        </div>
      </div>
    );
  if (!api) return <Loading />;
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/add" element={<AddEntry />} />
        <Route path="/edit/:id" element={<AddEntry />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/settings/*" element={<Settings />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
