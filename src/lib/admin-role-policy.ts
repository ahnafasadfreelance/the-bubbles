export type AdminRole = "owner" | "full_admin" | "order_management";

type AccessWithRole = { kind: string; role?: AdminRole };
type AuthorizedAccess = { kind: "authorized"; role: AdminRole };

export function hasAdminRole<T extends AccessWithRole>(
    access: T,
    ...roles: AdminRole[]
): access is T & AuthorizedAccess {
    return access.kind === "authorized" && access.role !== undefined && roles.includes(access.role);
}

export function canInviteStaffRole(actorRole: AdminRole, invitedRole: Exclude<AdminRole, "owner">): boolean {
    return actorRole === "owner" || (actorRole === "full_admin" && invitedRole === "order_management");
}

export function canRecordOrderPayment(role: AdminRole): boolean {
    return role === "owner" || role === "full_admin" || role === "order_management";
}

export function canManageStaffMember(
    actorRole: AdminRole,
    targetRole: AdminRole,
    actorUserId: string,
    targetUserId: string,
): boolean {
    return actorUserId !== targetUserId
        && targetRole !== "owner"
        && (actorRole === "owner" || (actorRole === "full_admin" && targetRole === "order_management"));
}
