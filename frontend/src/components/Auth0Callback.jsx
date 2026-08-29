import React, { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Auth0Callback() {
  const { error, isAuthenticated, user } = useAuth0();
  const { syncAuth0User } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated && user) {
      syncAuth0User(user);
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, user, navigate, syncAuth0User]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md bg-card border-destructive/20">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-bold text-destructive">Authentication Error</CardTitle>
            <CardDescription>{error.message || 'Failed to authenticate with Identity Provider'}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center pt-2">
            <Button onClick={() => navigate('/', { replace: true })}>
              Return to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="flex flex-col items-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="text-sm text-muted-foreground">Verifying authentication and establishing secure session...</p>
      </div>
    </div>
  );
}
