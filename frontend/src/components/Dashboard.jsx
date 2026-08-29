import React, { useState, useEffect } from 'react';
import Header from './Header';
import ProjectsFeed from './ProjectsFeed';
import StudentProfile from './StudentProfile';
import Profile from './Profile';
import AdminPanel from './AdminPanel';
import NotificationsPanel from './NotificationsPanel';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { userProfile } = useAuth();
  const [tab, setTab] = useState('feed');
  const [selectedAuthor, setSelectedAuthor] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [notifsOpen, setNotifsOpen] = useState(false);

  const fetchNotifs = async () => {
    try {
      const { data } = await api.get('/api/users/notifications');
      setNotifs(data);
    } catch {}
  };

  const handleMarkRead = async (id) => {
    try {
      await api.patch(`/api/users/notifications/${id}/read`);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/api/users/notifications/read-all');
      setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000);
    return () => clearInterval(interval);
  }, []);

  const selectAuthor = (id) => {
    setSelectedAuthor(id);
    setTab('profile-view');
  };

  const unreadCount = notifs.filter(n => !n.read).length;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header currentTab={tab} setCurrentTab={setTab} onOpenNotifications={() => setNotifsOpen(true)} unreadCount={unreadCount} />

      <main className="mx-auto w-full max-w-7xl grow px-4 py-8 sm:px-6 lg:px-8">
        {tab === 'feed' && <ProjectsFeed onSelectAuthor={selectAuthor} />}
        {(tab === 'profile' || tab === 'my-profile') && <Profile onSelectAuthor={selectAuthor} />}
        {tab === 'profile-view' && <StudentProfile userId={selectedAuthor} onSelectAuthor={selectAuthor} />}
        {tab === 'admin' && <AdminPanel onSelectAuthor={selectAuthor} />}
      </main>

      <NotificationsPanel
        open={notifsOpen}
        onClose={() => setNotifsOpen(false)}
        notifications={notifs}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
      />
    </div>
  );
}
