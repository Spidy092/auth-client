let config = {
  clientKey: null,
  authBaseUrl: null,
  redirectUri: null,
  usePkce: false, // optional future
};

export function setConfig(customConfig = {}) {
  if (!customConfig.clientKey || !customConfig.authBaseUrl) {
    throw new Error('Missing required config: clientKey and authBaseUrl are required');
  }

  config = {
    ...config,
    ...customConfig,
    redirectUri: customConfig.redirectUri || window.location.origin + '/callback',
  };
}

export function getConfig() {
  return { ...config };
}



// pass client key and authbaseurl and redirectUri