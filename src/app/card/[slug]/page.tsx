import type { Metadata } from "next";
import { notFound } from "next/navigation";
import VirtualCardPage from "@/components/virtual-card/VirtualCardPage";
import { getVirtualCardAsync } from "@/lib/virtual-card/registry";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const card = await getVirtualCardAsync(slug);
  if (!card) {
    return { title: "Card not found", robots: { index: false, follow: false } };
  }
  return {
    title: `${card.fullName} · ${card.title}`,
    description: card.valueLine,
    robots: { index: false, follow: false },
    openGraph: {
      title: `${card.fullName} · ${card.company}`,
      description: card.valueLine,
      images: card.headshotUrl ? [{ url: card.headshotUrl }] : undefined,
    },
  };
}

export default async function CardSlugPage({ params }: Props) {
  const { slug } = await params;
  const card = await getVirtualCardAsync(slug);
  if (!card) notFound();
  return <VirtualCardPage card={card} />;
}
