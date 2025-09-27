// Create: auth-client/react/useSessionMonitor.js
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '../index';

export const useSessionMonitor = (options = {}) => {
  const queryClient = useQueryClient();
  
  const {
    enabled = true,
    refetchInterval = 30 * 1000, // 30 seconds
    onSessionInvalid,
    onError
  } = options;

  return useQuery({
    queryKey: ['session-validation'],
    queryFn: async () => {
      try {
        const isValid = await auth.validateCurrentSession();
        
        if (!isValid && onSessionInvalid) {
          // Clear all cached data
          queryClient.clear();
          // Trigger custom callback
          onSessionInvalid();
          return { valid: false };
        }
        
        return { valid: isValid };
      } catch (error) {
        console.error('Session validation error:', error);
        if (onError) {
          onError(error);
        }
        throw error;
      }
    },
    enabled: enabled && !!auth.getToken(),
    refetchInterval,
    refetchIntervalInBackground: true,
    retry: 1,
    onError: (error) => {
      console.error('Session monitor error:', error);
      if (onError) {
        onError(error);
      }
    }
  });
};
