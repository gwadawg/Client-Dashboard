import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const db = createServiceClient();

  const [{ data: agents, error: agentErr }, { data: clients, error: clientErr }] = await Promise.all([
    db
      .from("closebot_agents")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("clients")
      .select("id, name")
      .eq("is_live", true)
      .order("name", { ascending: true }),
  ]);

  if (agentErr) return NextResponse.json({ error: agentErr.message }, { status: 500 });
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  return NextResponse.json({
    agents: agents ?? [],
    clients: clients ?? [],
  });
}
