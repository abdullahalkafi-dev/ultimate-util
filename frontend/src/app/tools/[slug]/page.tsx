import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ToolPage } from '@/features/tools/ToolPage';
import { getToolBySlug, visibleTools } from '@/registry';

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return visibleTools.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool || tool.status === 'hidden') return {};
  return { title: tool.name, description: tool.description };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const tool = getToolBySlug(slug);
  if (!tool || tool.status === 'hidden') notFound();
  return <ToolPage slug={slug} />;
}
