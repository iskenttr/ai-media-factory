import { Hero } from "@/components/landing/Hero";
import { Container } from "@/components/layout/Container";
import { Layout } from "@/components/layout/Layout";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <Layout
      header={
        <Container size="wide">
          <Logo />
          <Button size="compact" variant="floating">
            Sign in
          </Button>
        </Container>
      }
    >
      <Hero />
    </Layout>
  );
}
