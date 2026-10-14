import { useEffect, useRef, useState } from 'react';
import { fetchAssignableUsers, type AssignableUser } from './api';
import { errorMessage } from './format';

/** Users for "Assign to". Loaded once, the first time the drawer opens (1 request for the session). */
export function useAssignableUsers(enabled: boolean) {
  const [users, setUsers] = useState<AssignableUser[]>();
  const [error, setError] = useState<string>();
  const requested = useRef(false);

  useEffect(() => {
    if (!enabled || requested.current) return;
    requested.current = true;
    fetchAssignableUsers()
      .then(setUsers)
      .catch((err: unknown) => {
        requested.current = false;
        setError(errorMessage(err, 'Could not load users.'));
      });
  }, [enabled]);

  return { users, error };
}
