import "server-only";

import { randomBytes } from "node:crypto";

import { createPrivilegedClient } from "@/lib/supabase/privileged-server";
import type { Database } from "@/types/database";

type RestaurantTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
type TableDetails = Pick<RestaurantTable, "table_number" | "table_name">;

function validateTableId(tableId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId)) {
        throw new Error("Invalid table identifier.");
    }
}

function validateTableNumber(value: string) {
    const tableNumber = value.trim();
    if (!tableNumber || tableNumber.length > 64 || /[\u0000-\u001f\u007f]/.test(tableNumber)) {
        throw new Error("Table number must be 1 to 64 printable characters.");
    }
    return tableNumber;
}

function validateTableName(value: string | null | undefined) {
    const tableName = value?.trim() || null;
    if (tableName && (tableName.length > 120 || /[\u0000-\u001f\u007f]/.test(tableName))) {
        throw new Error("Table name must be at most 120 printable characters.");
    }
    return tableName;
}

export function generateQrToken() {
    return randomBytes(32).toString("base64url");
}

export async function createRestaurantTable(input: TableDetails) {
    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("restaurant_tables")
        .insert({
            table_number: validateTableNumber(input.table_number),
            table_name: validateTableName(input.table_name),
            qr_token: generateQrToken(),
        })
        .select("id, table_number, table_name, qr_token, is_active, created_at, updated_at")
        .single();

    if (error || !data) throw new Error("Unable to create the restaurant table.");
    return data;
}

export async function listRestaurantTables(): Promise<RestaurantTable[]> {
    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, table_number, table_name, qr_token, is_active, created_at, updated_at")
        .order("table_number", { ascending: true });

    if (error || !data) throw new Error("Unable to list restaurant tables.");
    return data;
}

export async function updateRestaurantTableDetails(
    tableId: string,
    input: Partial<TableDetails>,
) {
    validateTableId(tableId);
    const changes: Database["public"]["Tables"]["restaurant_tables"]["Update"] = {};

    if (input.table_number !== undefined) {
        changes.table_number = validateTableNumber(input.table_number);
    }
    if (input.table_name !== undefined) {
        changes.table_name = validateTableName(input.table_name);
    }
    if (Object.keys(changes).length === 0) throw new Error("No table details were provided.");

    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("restaurant_tables")
        .update(changes)
        .eq("id", tableId)
        .select("id, table_number, table_name, qr_token, is_active, created_at, updated_at")
        .maybeSingle();

    if (error || !data) throw new Error("Unable to update the restaurant table.");
    return data;
}

export async function setRestaurantTableActive(tableId: string, isActive: boolean) {
    validateTableId(tableId);
    if (typeof isActive !== "boolean") throw new Error("Invalid active state.");

    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("restaurant_tables")
        .update({ is_active: isActive })
        .eq("id", tableId)
        .select("id, table_number, table_name, qr_token, is_active, created_at, updated_at")
        .maybeSingle();

    if (error || !data) throw new Error("Unable to change the restaurant table state.");
    return data;
}

export async function deleteRestaurantTable(tableId: string) {
    validateTableId(tableId);
    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("restaurant_tables")
        .delete()
        .eq("id", tableId)
        .select("id")
        .maybeSingle();

    if (error || !data) throw new Error("Unable to delete the restaurant table.");
}

export async function rotateRestaurantTableQrToken(tableId: string) {
    validateTableId(tableId);
    const supabase = createPrivilegedClient();
    const { data, error } = await supabase
        .from("restaurant_tables")
        .update({ qr_token: generateQrToken() })
        .eq("id", tableId)
        .select("id, table_number, table_name, qr_token, is_active, created_at, updated_at")
        .maybeSingle();

    if (error || !data) throw new Error("Unable to rotate the restaurant table QR token.");
    return data;
}