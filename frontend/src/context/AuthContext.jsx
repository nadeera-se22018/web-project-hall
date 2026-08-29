import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import api, { setAuthTokenGetter } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [userProfile, setUserProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  const {
    user: auth0User,
    isAuthenticated: isAuth0Authenticated,
    isLoading: isAuth0Loading,
    loginWithRedirect,
    logout: auth0Logout,
    getAccessTokenSilently,
    getIdTokenClaims,
  } = useAuth0();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      if (isAuth0Authenticated) {
        try {
          return await getAccessTokenSilently();
        } catch {
          try {
            const claims = await getIdTokenClaims();
            return claims?.__raw;
          } catch {
            return null;
          }
        }
      }
      return localStorage.getItem('access_token');
    });
  }, [isAuth0Authenticated, getAccessTokenSilently, getIdTokenClaims]);

  const syncAuth0User = useCallback(async (user) => {
    if (!user) return;
    try {
      const { data } = await api.get('/api/auth/me');
      setUserProfile(data);
    } catch {
      setUserProfile({
        id: user.sub,
        email: user.email,
        name: user.name || user.nickname || user.email,
        avatar_url: user.picture,
        role: user['https://projecthall.com/roles']?.[0] || user.role || 'student',
        permissions: user['https://projecthall.com/permissions'] || ['projects:read', 'projects:create', 'projects:write', 'projects:like'],
      });
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      setUserProfile(data);
    } catch {
      if (isAuth0Authenticated && auth0User) {
        syncAuth0User(auth0User);
      } else {
        setUserProfile(null);
      }
    } finally {
      setIsProfileLoading(false);
    }
  }, [isAuth0Authenticated, auth0User, syncAuth0User]);

  const loginWithAuth0 = () => {
    const callbackUrl = import.meta.env.VITE_AUTH0_CALLBACK_URL || `${window.location.origin}/callback`;
    return loginWithRedirect({
      authorizationParams: {
        redirect_uri: callbackUrl,
      },
    });
  };

  const login = async (email, password) => {
    await api.post('/api/auth/login', { email, password });
    await fetchProfile();
  };

  const signup = async (email, password, role_id) => {
    await api.post('/api/auth/signup', { email, password, role_id });
    await fetchProfile();
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/revoke');
    } catch {
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('id_token');
    setUserProfile(null);

    if (isAuth0Authenticated) {
      auth0Logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    }
  };

  useEffect(() => {
    if (!isAuth0Loading) {
      if (isAuth0Authenticated && auth0User) {
        syncAuth0User(auth0User);
      } else {
        fetchProfile();
      }
    }

    const handleLogoutEvent = () => setUserProfile(null);
    window.addEventListener('auth-logout', handleLogoutEvent);
    return () => window.removeEventListener('auth-logout', handleLogoutEvent);
  }, [isAuth0Loading, isAuth0Authenticated, auth0User, syncAuth0User, fetchProfile]);

  const isLoading = isAuth0Loading || (isProfileLoading && !userProfile);

  return (
    <AuthContext.Provider
      value={{
        userProfile,
        isLoading,
        login,
        signup,
        logout,
        loginWithAuth0,
        fetchProfile,
        setUserProfile,
        syncAuth0User,
        isAuth0Authenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
