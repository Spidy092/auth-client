// auth-client/config.js
let config = {
  clientKey: null,
  authBaseUrl: null,
  redirectUri: null,
  accountUiUrl: null,
  isRouter: false, // ✅ Add router flag
  usePkce: false,
};

export function setConfig(customConfig = {}) {
  if (!customConfig.clientKey || !customConfig.authBaseUrl) {
    throw new Error('Missing required config: clientKey and authBaseUrl are required');
  }

  config = {
    ...config,
    ...customConfig,
    redirectUri: customConfig.redirectUri || window.location.origin + '/callback',
    // ✅ Auto-detect router mode
    isRouter: customConfig.isRouter || customConfig.clientKey === 'account-ui'
  };

  console.log(`🔧 Auth Client Mode: ${config.isRouter ? 'ROUTER' : 'CLIENT'}`, {
    clientKey: config.clientKey,
    isRouter: config.isRouter
  });
}

export function getConfig() {
  return { ...config };
}

// ✅ Helper function
export function isRouterMode() {
  return config.isRouter;
}
