import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useAuth } from '../context/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { User, Envelope, Phone, Buildings, IdentificationCard, ShieldCheck, CheckCircle, Folder } from '@phosphor-icons/react';
import ProjectCard from './ProjectCard';
import ProjectForm from './ProjectForm';
import ThumbnailUpload from './ThumbnailUpload';
import api from '../lib/api';
import { sanitizeText } from '../lib/sanitize';

export default function Profile({ onSelectAuthor }) {
  const { user: auth0User, isAuthenticated } = useAuth0();
  const { userProfile } = useAuth();
  const [projectsData, setProjectsData] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [uploadProject, setUploadProject] = useState(null);

  const rawUsername = auth0User?.nickname || auth0User?.preferred_username || auth0User?.username || auth0User?.['https://projecthall.com/username'] || (auth0User?.email ? auth0User.email.split('@')[0] : null) || userProfile?.name || 'N/A';
  const rawName = auth0User?.name || `${auth0User?.given_name || ''} ${auth0User?.family_name || ''}`.trim() || userProfile?.name || 'Not Provided';
  const rawEmail = auth0User?.email || userProfile?.email || 'Not Provided';
  const rawContactNumber = auth0User?.phone_number || auth0User?.phone || auth0User?.['https://projecthall.com/phone_number'] || auth0User?.['https://projecthall.com/phone'] || auth0User?.user_metadata?.phone_number || auth0User?.user_metadata?.phone || null;
  const rawOrganization = auth0User?.['https://projecthall.com/organization'] || auth0User?.['https://projecthall.com/org_name'] || auth0User?.organization || auth0User?.org_name || auth0User?.company || auth0User?.user_metadata?.organization || auth0User?.user_metadata?.company || null;

  const username = sanitizeText(rawUsername);
  const name = sanitizeText(rawName);
  const email = sanitizeText(rawEmail);
  const contactNumber = rawContactNumber ? sanitizeText(rawContactNumber) : null;
  const organization = rawOrganization ? sanitizeText(rawOrganization) : null;

  const avatarUrl = auth0User?.picture || userProfile?.avatar_url;
  const isEmailVerified = auth0User?.email_verified ?? true;

  const fetchMyProjects = async () => {
    if (!userProfile?.id) return;
    try {
      const res = await api.get(`/api/users/${userProfile.id}/profile`);
      setProjectsData(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchMyProjects();
  }, [userProfile?.id]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this project?')) return;
    try {
      await api.delete(`/api/projects/${id}`);
      fetchMyProjects();
    } catch {}
  };

  return (
    <div className="space-y-8">
      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border/50 pb-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <Avatar className="h-20 w-20 border-2 border-primary/20 shadow-sm">
                <AvatarImage src={avatarUrl} alt={name} />
                <AvatarFallback className="text-xl font-bold">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">{name}</h1>
                  {isEmailVerified && (
                    <Badge variant="outline" className="gap-1 border-green-500/30 bg-green-500/10 text-green-500 text-[10px]">
                      <CheckCircle size={12} weight="fill" /> Verified
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <IdentificationCard size={14} className="text-primary" /> @{username}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="secondary" className="capitalize text-[11px]">
                    {userProfile?.role || 'Authenticated User'}
                  </Badge>
                  {isAuthenticated && (
                    <Badge variant="outline" className="gap-1 border-primary/30 text-primary text-[10px]">
                      <ShieldCheck size={12} weight="bold" /> Auth0 Managed
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Account Information</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <User size={18} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">Username</span>
                <p className="text-sm font-semibold text-foreground truncate">{username}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <IdentificationCard size={18} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">Name</span>
                <p className="text-sm font-semibold text-foreground truncate">{name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Envelope size={18} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">Email Address</span>
                <p className="text-sm font-semibold text-foreground truncate">{email}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Phone size={18} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">Contact Number</span>
                {contactNumber ? (
                  <p className="text-sm font-semibold text-foreground truncate">{contactNumber}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not Provided</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:col-span-2 lg:col-span-2">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Buildings size={18} />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[11px] font-medium text-muted-foreground">Organization/Business Name</span>
                {organization ? (
                  <p className="text-sm font-semibold text-foreground truncate">{organization}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Not Provided</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {projectsData && projectsData.projects && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Folder size={16} className="text-primary" /> My Published Projects
            </h3>
            <span className="text-xs text-muted-foreground">{projectsData.projects.length} Projects</span>
          </div>

          {projectsData.projects.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center border border-dashed border-border rounded-xl">
              No projects created yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projectsData.projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  isOwner={true}
                  onSelectAuthor={onSelectAuthor}
                  onEdit={(proj) => {
                    setActiveProject(proj);
                    setFormOpen(true);
                  }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

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
              fetchMyProjects();
            }
          }}
        />
      )}

      {uploadProject && (
        <ThumbnailUpload
          open={!!uploadProject}
          projectId={uploadProject.id}
          onClose={() => {
            setUploadProject(null);
            fetchMyProjects();
          }}
          onSuccess={() => {
            setUploadProject(null);
            fetchMyProjects();
          }}
        />
      )}
    </div>
  );
}
