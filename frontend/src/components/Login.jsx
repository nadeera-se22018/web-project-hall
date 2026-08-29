import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api, { API_URL } from '../lib/api';
import { ShieldCheck } from '@phosphor-icons/react';

export default function Login() {
  const { login, signup, loginWithAuth0 } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState('3');
  const [otpSent, setOtpSent] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Login failed', type: 'error' });
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      await signup(email, password, parseInt(role));
      setMsg({ text: 'Signup successful!', type: 'success' });
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Signup failed', type: 'error' });
    }
  };

  const handleSendOTP = async () => {
    try {
      await api.post('/api/auth/otp/send', { email });
      setOtpSent(true);
      setMsg({ text: 'OTP sent! Check backend console.', type: 'success' });
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'Failed to send OTP', type: 'error' });
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/auth/otp/verify', { email, code });
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('id_token', data.id_token);
      window.location.reload();
    } catch (err) {
      setMsg({ text: err.response?.data?.error || 'OTP verification failed', type: 'error' });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md bg-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Project Showcase</CardTitle>
          <CardDescription>Faculty of Computing Portal</CardDescription>
        </CardHeader>
        <CardContent>
          {msg.text && (
            <div className={`mb-4 p-2 text-xs rounded border ${msg.type === 'error' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>{msg.text}</div>
          )}
          <div className="mb-4">
            <Button
              type="button"
              className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              onClick={loginWithAuth0}
            >
              <ShieldCheck size={18} />
              Log in with Auth0 (SSO)
            </Button>
          </div>
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-muted">
              <TabsTrigger value="login">Password</TabsTrigger>
              <TabsTrigger value="otp">OTP</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handlePasswordLogin} className="space-y-4 pt-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label>Password</Label><Input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full">Sign In</Button>
              </form>
            </TabsContent>
            <TabsContent value="otp">
              <form onSubmit={handleVerifyOTP} className="space-y-4 pt-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                {otpSent && <div className="space-y-2"><Label>OTP Code</Label><Input type="text" required value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" /></div>}
                {!otpSent ? <Button type="button" onClick={handleSendOTP} className="w-full">Send OTP</Button> : <Button type="submit" className="w-full">Verify & Sign In</Button>}
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={handleSignup} className="space-y-4 pt-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-2"><Label>Password</Label><Input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
                <div className="space-y-2"><Label>Role</Label><select value={role} onChange={e => setRole(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><option value="3">Student</option><option value="2">Recruiter</option></select></div>
                <Button type="submit" className="w-full">Sign Up</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 border-t border-border pt-4">
          <Button variant="outline" className="w-full" onClick={() => window.location.href = `${API_URL}/api/auth/google`}>Continue with Google</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
