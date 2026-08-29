import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.jsx'

const domain = import.meta.env.VITE_AUTH0_DOMAIN || 'dev-dummy.us.auth0.com'
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || 'dummy-client-id'
const redirectUri = import.meta.env.VITE_AUTH0_CALLBACK_URL || `${window.location.origin}/callback`
const audience = import.meta.env.VITE_AUTH0_AUDIENCE

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Auth0Provider
        domain={domain}
        clientId={clientId}
        authorizationParams={{
          redirect_uri: redirectUri,
          ...(audience ? { audience } : {}),
          scope: 'openid profile email',
        }}
        useRefreshTokens={true}
        cacheLocation="localstorage"
      >
        <App />
      </Auth0Provider>
    </BrowserRouter>
  </StrictMode>,
)
