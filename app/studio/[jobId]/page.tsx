import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { Layout } from "@/components/layout/Layout";
import { Studio } from "@/components/studio/Studio";

export default async function StudioPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <Layout header={<Container size="wide"><Logo /></Container>}><Studio jobId={jobId} /></Layout>;
}
