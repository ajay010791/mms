import { PublicClientApplication } from '@azure/msal-browser';

let _instance     = null;
let _initialized  = false;
let _clientId     = null;
let _tenantId     = null;

export const getMsalInstance = async (clientId, tenantId) => {
  // Reuse if same credentials and already initialized
  if (_instance && _initialized && _clientId === clientId && _tenantId === tenantId) {
    return _instance;
  }

  // Dispose old instance if credentials changed
  if (_instance && (_clientId !== clientId || _tenantId !== tenantId)) {
    _instance    = null;
    _initialized = false;
  }

  _clientId = clientId;
  _tenantId = tenantId;

  _instance = new PublicClientApplication({
    auth: {
      clientId,
      authority:                 `https://login.microsoftonline.com/${tenantId}`,
      redirectUri:               window.location.origin,
      navigateToLoginRequestUrl: false
    },
    cache: {
      cacheLocation:          'sessionStorage',
      storeAuthStateInCookie: false
    },
    system: {
      allowRedirectInIframe: false,
      windowHashTimeout:     60000,
      iframeHashTimeout:     6000,
      loadFrameTimeout:      0,
      loggerOptions: {
        logLevel:            3,  // Warning
        piiLoggingEnabled:   false
      }
    }
  });

  await _instance.initialize();
  _initialized = true;

  return _instance;
};

export const resetMsalInstance = () => {
  _instance    = null;
  _initialized = false;
  _clientId    = null;
  _tenantId    = null;
};
