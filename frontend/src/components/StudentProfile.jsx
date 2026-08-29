import React, { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { UserPlus, UserMinus } from '@phosphor-icons/react';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';
import ThumbnailUpload from './ThumbnailUpload';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { sanitizeText } from '../lib/sanitize';

export default function StudentProfile({ userId, onSelectAuthor }) {
  const { userProfile } = useAuth();
  const [data, setData] = useState(null);
  const [following, setFollowing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [uploadProject, setUploadProject] = useState(null);

  const fetchProfile = async () => {
    try {
      const res = await api.get(`/api/users/${userId}/profile`);
      setData(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchProfile();
    const checkFollow = () => {
      const key = `followed_${userProfile?.id}_${userId}`;
      setFollowing(!!localStorage.getItem(key));
    };
    checkFollow();
  }, [userId, userProfile]);

  const handleFollow = async () => {
    try {
      const res = await api.post(`/api/users/${userId}/follow`);
      setFollowing(res.data.following);
      setData(prev => ({
        ...prev,
        follower_count: prev.follower_count + (res.data.following ? 1 : -1)
      }));
      const key = `followed_${userProfile?.id}_${userId}`;
      if (res.data.following) localStorage.setItem(key, 'true');
      else localStorage.removeItem(key);
    } catch {}
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project?')) return;
    try {
      await api.delete(`/api/projects/${id}`);
      fetchProfile();
    } catch {}
  };

  if (!data) return <div className="text-center py-12 text-xs text-muted-foreground">Loading profile...</div>;

  const { user, projects, follower_count } = data;
  const isMe = userProfile?.id === user.id;
  const canFollow = userProfile && userProfile.permissions?.includes('users:follow') && !isMe;
  const safeName = sanitizeText(user.name);
  const safeEmail = sanitizeText(user.email);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-6 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14 border-2 border-primary/20">
            <AvatarImage src={user.avatar_url} />
            <AvatarFallback className="text-lg">{safeName?.slice(0,2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <h2 className="text-lg font-bold leading-none">{safeName}</h2>
            <p className="text-xs text-muted-foreground">{safeEmail}</p>
            <p className="text-[10px] text-primary font-semibold">{follower_count} {follower_count === 1 ? 'Follower' : 'Followers'}</p>
          </div>
        </div>
        {canFollow && (
          <Button onClick={handleFollow} variant={following ? 'outline' : 'default'} size="sm" className="gap-1.5 text-xs">
            {following ? <UserMinus size={14} /> : <UserPlus size={14} />}
            {following ? 'Unfollow' : 'Follow Student'}
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold border-b border-border/40 pb-2">Projects Showcase</h3>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">No projects created yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                isOwner={isMe}
                onSelectAuthor={onSelectAuthor}
                onEdit={(proj) => { setActiveProject(proj); setFormOpen(true); }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <ProjectForm
          open={formOpen}
          project={activeProject}
          onClose={() => setFormOpen(false)}
          onSuccess={(savedProj) => {
            setFormOpen(false);
            if (!activeProject) {
              setUploadProject(savedProj);
            } else {
              fetchProfile();
            }
          }}
        />
      )}

      {uploadProject && (
        <ThumbnailUpload
          open={!!uploadProject}
          projectId={uploadProject.id}
          onClose={() => { setUploadProject(null); fetchProfile(); }}
          onSuccess={() => { setUploadProject(null); fetchProfile(); }}
        />
      )}
    </div>
  );
}
