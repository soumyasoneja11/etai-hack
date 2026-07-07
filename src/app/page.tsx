import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { TrustedBy } from "@/components/landing/TrustedBy";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { WorkflowTimeline } from "@/components/landing/WorkflowTimeline";
import { TechStackSection } from "@/components/landing/TechStack";
import { ArchitecturePreview } from "@/components/landing/ArchitecturePreview";
import { StatsSection } from "@/components/landing/StatsSection";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <TrustedBy />
      <FeaturesSection />
      <WorkflowTimeline />
      <TechStackSection />
      <ArchitecturePreview />
      <StatsSection />
      <Footer />
    </main>
  );
}
