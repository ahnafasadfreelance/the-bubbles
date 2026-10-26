import type { User } from "@supabase/supabase-js";

export type CustomerIdentity = {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
};

function readDisplayName(user: User) {
    const value = user.user_metadata.full_name ?? user.user_metadata.name;
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

function readAvatarUrl(user: User) {
    const value = user.user_metadata.avatar_url ?? user.user_metadata.picture;
    if (typeof value !== "string" || value.length > 2048) return null;

    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

export function customerIdentityFromUser(user: User): CustomerIdentity {
    return {
        id: user.id,
        email: user.email ?? null,
        displayName: readDisplayName(user),
        avatarUrl: readAvatarUrl(user),
    };
}