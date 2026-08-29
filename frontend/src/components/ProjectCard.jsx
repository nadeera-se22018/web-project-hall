import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, UserPlus, UserMinus, Pencil, Trash } from '@phosphor-icons/react';
import api, { API_URL } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { sanitizeText } from '../lib/sanitize';

export default function ProjectCard({ project, onEdit, onDelete, onSelectAuthor, isOwner }) {
  const { userProfile } = useAuth();
  const [likes, setLikes] = useState(project.like_count || 0);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);

  const storageKey = `liked_${userProfile?.id}_${project.id}`;

  useEffect(() => {
    setLiked(!!localStorage.getItem(storageKey));
  }, [storageKey]);

  const handleLike = async () => {
    try {
      const { data } = await api.post(`/api/projects/${project.id}/like`);
      setLikes(data.like_count);
      setLiked(data.liked);
      if (data.liked) {
        localStorage.setItem(storageKey, 'true');
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (err) {
    }
  };

  const handleFollow = async () => {
    try {
      const { data } = await api.post(`/api/users/${project.author_id}/follow`);
      setFollowing(data.following);
    } catch (err) {
    }
  };

  const showFollow = userProfile && userProfile.permissions?.includes('users:follow') && project.author_id !== userProfile.id;
  const imageUrl = project.thumbnail_url ? `${API_URL}${project.thumbnail_url}` : null;
  const safeTitle = sanitizeText(project.title);
  const safeDescription = sanitizeText(project.description);
  const safeAuthorName = sanitizeText(project.author_name);
  const safeAuthorEmail = sanitizeText(project.author_email);

  return (
    <Card className="flex flex-col h-full bg-card overflow-hidden transition-all hover:border-primary/45 py-0">
      <div className="h-44 w-full bg-accent/15 flex items-center justify-center border-b border-border overflow-hidden relative">
        {imageUrl ? (
          <img src={imageUrl} alt={safeTitle} className="h-full w-full object-cover transition-transform hover:scale-105 duration-300" />
        ) : (
          <span className="text-xs text-muted-foreground uppercase tracking-widest">No Thumbnail</span>
        )}
        {isOwner && (
          <span className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-semibold border ${
            project.visibility === 'public' 
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' 
              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
          }`}>
            {project.visibility === 'public' ? 'Public' : 'Private'}
          </span>
        )}
      </div>
      <CardHeader className="px-4">
        <CardTitle className="text-base font-bold line-clamp-1 my-0">{safeTitle}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pt-0 pb-2 grow">
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{safeDescription}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 p-4 pt-2 border-t border-border/40 mt-auto">
        <div className="flex w-full items-center justify-between">
          <button onClick={() => onSelectAuthor(project.author_id)} className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity">
            <Avatar className="h-6 w-6">
              <AvatarImage src={project.author_avatar} />
              <AvatarFallback className="text-[9px]">{safeAuthorName?.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold leading-none">{safeAuthorName}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">{safeAuthorEmail}</span>
            </div>
          </button>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={handleLike} className="h-7 px-2 text-xs gap-1">
              <Heart size={14} weight={liked ? 'fill' : 'regular'} className={liked ? 'text-primary' : 'text-muted-foreground'} />
              <span>{likes}</span>
            </Button>
            {showFollow && (
              <Button variant="ghost" size="sm" onClick={handleFollow} className="h-7 px-2 text-xs gap-1 text-primary">
                {following ? <UserMinus size={14} /> : <UserPlus size={14} />}
                <span>{following ? 'Unfollow' : 'Follow'}</span>
              </Button>
            )}
          </div>
        </div>
        {isOwner && (
          <div className="flex w-full gap-2 border-t border-border/30 pt-2 ">
            <Button variant="outline" size="sm" onClick={() => onEdit(project)} className="flex-1 h-7 text-xs gap-1"><Pencil size={12} /> Edit</Button>
            <Button variant="destructive" size="sm" onClick={() => onDelete(project.id)} className="flex-1 h-7 text-xs gap-1"><Trash size={12} /> Delete</Button>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
