import { useEffect, useState } from 'react';
import { getContext } from '@microsoft/power-apps/app';

/** Signed-in user's name from the Power Apps host (nothing is shown if the host does not provide it). */
export function useCurrentUser() {
  const [user, setUser] = useState<{ name?: string; email?: string }>();
  useEffect(() => {
    let alive = true;
    getContext()
      .then((ctx) => alive && setUser({ name: ctx.user.fullName, email: ctx.user.userPrincipalName }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return user;
}
