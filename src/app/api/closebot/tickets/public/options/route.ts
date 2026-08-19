import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const db = createServiceClient();

  const { data: links, error } = await db
    .from("closebot_agent_clients")
    .select("client_id, agent:closebot_agents(is_active), client:clients(id, name, is_live)")
    .order("client_id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = (links ?? [])
    .map((row) => {
      const rec = row as {
        client: { id: string; name: string; is_live: boolean } | { id: string; name: string; is_live: boolean }[] | null;
        agent: { is_active: boolean } | { is_active: boolean }[] | null;
      };
      const client = Array.isArray(rec.client) ? rec.client[0] ?? null : rec.client;
      const agent = Array.isArray(rec.agent) ? rec.agent[0] ?? null : rec.agent;
      if (!client || !client.is_live || !agent?.is_active) return null;
      return { id: client.id, name: client.name };
    })
    .filter((c): c is { id: string; name: string } => Boolean(c))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ clients });
}
