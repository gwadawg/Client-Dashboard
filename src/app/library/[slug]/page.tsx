import { redirect, notFound } from "next/navigation";
import { createAuthClient, createServiceClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { loadLibraryDoc } from "@/lib/library-content";
import { getAllLibrarySlugs } from "@/lib/library-content";
import LibraryDocViewer from "@/components/library/LibraryDocViewer";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getAllLibrarySlugs().map((slug) => ({ slug }));
}

export default async function LibraryDocPage({ params }: Props) {
  const { slug } = await params;

  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("is_owner, allowed_permissions")
    .eq("id", user.id)
    .maybeSingle();

  const canView = hasPermission("resources", {
    isOwner: profile?.is_owner ?? false,
    allowedPermissions: (profile?.allowed_permissions ?? null) as string[] | null,
  });
  if (!canView) redirect("/dashboard");

  const doc = loadLibraryDoc(slug);
  if (!doc) notFound();

  return <LibraryDocViewer meta={doc.meta} body={doc.body} />;
}
