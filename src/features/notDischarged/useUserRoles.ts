import { useCallback, useEffect, useState } from 'react';
import { fetchRoleAssignments, rolesForBusinessUnit, type RoleAssignments } from './api';
import { canEditCaseStatus } from './history';

/**
 * The signed-in user's escalation roles (ND Escalation Config, else Job Title), loaded once.
 * canEditStatus(buId): false for Billing Supervisors / Duty Managers; while the roles load
 * (or if they fail to load) the status stays read-only.
 */
export function useUserRoles() {
  const [assignments, setAssignments] = useState<RoleAssignments>();

  useEffect(() => {
    let alive = true;
    fetchRoleAssignments()
      .then((a) => alive && setAssignments(a))
      .catch((err: unknown) => console.error('[roles] could not load escalation roles', err));
    return () => {
      alive = false;
    };
  }, []);

  const canEditStatus = useCallback(
    (buId: string | undefined) => (assignments ? canEditCaseStatus(rolesForBusinessUnit(assignments, buId)) : false),
    [assignments],
  );

  return { canEditStatus, loaded: Boolean(assignments) };
}
