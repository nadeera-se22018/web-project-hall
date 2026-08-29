import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bell, SignOut, Shield, Folder, User as UserIcon } from '@phosphor-icons/react';

export default function Header({ currentTab, setCurrentTab, onOpenNotifications, unreadCount }) {
  const { userProfile, logout } = useAuth();

  if (!userProfile) return null;

  const isAdmin = userProfile.role === 'admin' || userProfile.permissions?.includes('users:manage');

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold tracking-wider text-primary">PROJECT_HALL</span>
          <nav className="flex space-x-1">
            <Button variant={currentTab === 'feed' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCurrentTab('feed')} className="gap-1.5 text-xs">
              <Folder size={14} /> Projects
            </Button>
            <Button variant={currentTab === 'profile' || currentTab === 'my-profile' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCurrentTab('profile')} className="gap-1.5 text-xs">
              <UserIcon size={14} /> Profile
            </Button>
            {isAdmin && (
              <Button variant={currentTab === 'admin' ? 'secondary' : 'ghost'} size="sm" onClick={() => setCurrentTab('admin')} className="gap-1.5 text-xs">
                <Shield size={14} /> Admin
              </Button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onOpenNotifications} className="relative h-8 w-8">
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </Button>

          <div className="flex items-center gap-2.5 pl-2 border-l border-border">
            <button onClick={() => setCurrentTab('profile')} className="flex items-center gap-2.5 text-left focus:outline-none rounded-md hover:opacity-80 transition-opacity">
              <Avatar className="h-7 w-7">
                <AvatarImage src={userProfile.avatar_url} alt={userProfile.name} />
                <AvatarFallback className="text-[10px]">{userProfile.name?.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="hidden flex-col text-left sm:flex">
                <span className="text-xs font-semibold leading-none">{userProfile.name || userProfile.email}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground capitalize leading-none">{userProfile.role}</span>
              </div>
            </button>
            <Button variant="ghost" size="icon" onClick={logout} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <SignOut size={16} />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
