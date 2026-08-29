import React, { useState, useEffect } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye, EyeSlash, Trash } from '@phosphor-icons/react';
import api from '../lib/api';
import { sanitizeText } from '../lib/sanitize';

export default function AdminProjects({ onSelectAuthor }) {
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/api/admin/projects');
      setProjects(data);
    } catch {
      setError('Failed to fetch projects');
    }
  };

  const handleToggleVisibility = async (id, currentVis) => {
    try {
      setError('');
      const nextVis = currentVis === 'public' ? 'removed' : 'public';
      await api.patch(`/api/admin/projects/${id}/visibility`, { visibility: nextVis });
      fetchProjects();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to modify visibility');
    }
  };

  const handleHardDelete = async (id) => {
    if (!window.confirm('PERMANENTLY hard delete this project? This cannot be undone.')) return;
    try {
      setError('');
      await api.delete(`/api/admin/projects/${id}`);
      fetchProjects();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete project');
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return (
    <div className="space-y-4">
      {error && <div className="p-2 text-xs rounded border bg-destructive/10 text-destructive border-destructive/20">{error}</div>}
      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>Project Title</TableHead>
              <TableHead>Author</TableHead>
              <TableHead className="text-center">Visibility</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-xs py-8 text-muted-foreground">No projects found.</TableCell></TableRow>
            ) : (
              projects.map((p) => {
                const safeTitle = sanitizeText(p.title);
                const safeAuthor = sanitizeText(p.author_name || p.author_email);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-semibold">{safeTitle}</TableCell>
                    <TableCell>
                      <button onClick={() => onSelectAuthor(p.created_by)} className="text-xs text-primary hover:underline">
                        {safeAuthor}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${p.visibility === 'public' ? 'bg-green-500/10 text-green-500 border-green-500/25' : 'bg-destructive/10 text-destructive border-destructive/25'}`}>
                        {p.visibility}
                      </span>
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1.5 h-12">
                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleToggleVisibility(p.id, p.visibility)}>
                        {p.visibility === 'public' ? <EyeSlash size={12} /> : <Eye size={12} />}
                      </Button>
                      <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleHardDelete(p.id)}>
                        <Trash size={12} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
