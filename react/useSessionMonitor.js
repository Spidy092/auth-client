// auth-client/react/useSessionMonitor.js
// Enhanced session monitoring hook for detecting Keycloak admin session deletions
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { auth } from '../index';

/**
 * useSessionMonitor - React hook for periodic session validation
 * 
 * This hook validates that the user's session still exists in Keycloak.
 * When an admin deletes a session from Keycloak Admin UI, this hook
 * will detect it and trigger the onSessionInvalid callback.
 * 
 * @param {Object} options Configuration options
 * @param {boolean} options.enabled - Enable/disable monitoring (default: true)
 * @param {number} options.refetchInterval - Validation interval in ms (default: 120000 = 2 min)
 * @param {Function} options.onSessionInvalid - Callback when session is deleted
 * @param {Function} options.onError - Callback for validation errors
 * @param {boolean} options.autoLogout - Auto logout on invalid session (default: true)
 * @param {boolean} options.validateOnMount - Validate session immediately on mount (default: true)
 */
export const useSessionMonitor = (options = {}) => {
  const queryClient = useQueryClient();

  const {
    enabled = true,
    refetchInterval = 2 * 60 * 1000, // 2 minutes (matching config default)
    onSessionInvalid,
    onError,
    autoLogout = true,
    validateOnMount = true,
  } = options;

  // Handle session invalidation
  const handleInvalid = useCallback(() => {
    console.log('🚨 useSessionMonitor: Session invalid detected');

    // Clear all react-query cache
    queryClient.clear();

    // Auto logout if enabled
    if (autoLogout) {
      auth.clearToken();
      auth.clearRefreshToken();
    }

    // Call custom callback
    if (onSessionInvalid) {
      onSessionInvalid();
    }
  }, [queryClient, autoLogout, onSessionInvalid]);

  // Session validation query
  const query = useQuery({
    queryKey: ['session-validation'],
    queryFn: async () => {
      try {
        const token = auth.getToken();
        if (!token) {
          return { valid: false, reason: 'no_token' };
        }

        console.log('🔍 useSessionMonitor: Validating session...');
        const isValid = await auth.validateCurrentSession();

        if (!isValid) {
          console.log('❌ useSessionMonitor: Session no longer valid');
          handleInvalid();
          return { valid: false, reason: 'session_deleted' };
        }

        console.log('✅ useSessionMonitor: Session still valid');
        return { valid: true };
      } catch (error) {
        console.error('⚠️ useSessionMonitor: Validation error:', error);
        if (onError) {
          onError(error);
        }
        throw error;
      }
    },
    enabled: enabled && !!auth.getToken(),
    refetchInterval,
    refetchIntervalInBackground: true,
    retry: 2,
    retryDelay: 5000,
    staleTime: refetchInterval / 2, // Consider stale at half the interval
  });

  // Validate on visibility change (when user returns to tab)
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && auth.getToken()) {
        console.log('👁️ useSessionMonitor: Tab visible - triggering validation');
        queryClient.invalidateQueries({ queryKey: ['session-validation'] });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, queryClient]);

  // Validate immediately on mount if enabled
  useEffect(() => {
    if (validateOnMount && enabled && auth.getToken()) {
      queryClient.invalidateQueries({ queryKey: ['session-validation'] });
    }
  }, [validateOnMount, enabled, queryClient]);

  return {
    ...query,
    isSessionValid: query.data?.valid ?? true,
    invalidationReason: query.data?.reason,
    manualValidate: () => queryClient.invalidateQueries({ queryKey: ['session-validation'] }),
  };
};

