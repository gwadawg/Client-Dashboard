import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VirtualCardEducatePage from "@/components/virtual-card/VirtualCardEducatePage";
import { getVirtualCardAsync } from "@/lib/virtual-card/registry";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = await getVirtualCardAsync(slug);
  if (!card) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }
  const title =
    card.product === "dscr"
      ? `DSCR refinance basics · ${card.fullName}`
      : `Reverse mortgage basics · ${card.fullName}`;
  return {
    title,
    description: card.valueLine,
    robots: { index: false, follow: false },
  };
}

export default async function CardLearnPage({ params }: Props) {
  const { slug } = await params;
  const card = await getVirtualCardAsync(slug);
  if (!card) notFound();
  return <VirtualCardEducatePage card={card} />;
}
