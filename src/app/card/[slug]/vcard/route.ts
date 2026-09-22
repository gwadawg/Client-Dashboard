import { NextResponse } from "next/server";
import { getVirtualCardAsync } from "@/lib/virtual-card/registry";
import { buildVCard } from "@/lib/virtual-card/vcard";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_req: Request, { params }: Props) {
  const { slug } = await params;
  const card = await getVirtualCardAsync(slug);
  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = buildVCard(card);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${card.slug}.vcf"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
