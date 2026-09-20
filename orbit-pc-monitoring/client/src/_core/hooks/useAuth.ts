import { trpc } from "@/lib/trpc";
import { useCallback, useMemo } from "react";

export function useAuth() {
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const state = useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      logout,
    }),
    [meQuery.data, meQuery.isLoading, meQuery.error, logout]
  );

  return state;
}
