import { AnalysisScreen } from "@/components/analysis/AnalysisScreen";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/layout/Container";
import { Layout } from "@/components/layout/Layout";

interface AnalysisPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function AnalysisPage({ params }: AnalysisPageProps) {
  const { jobId } = await params;
  return (
    <Layout
      header={
        <Container size="wide">
          <Logo />
        </Container>
      }
    >
      <AnalysisScreen jobId={jobId} />
    </Layout>
  );
}
