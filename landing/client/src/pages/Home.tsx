import { useState } from "react";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Showcase } from "@/components/landing/Showcase";
import { Pricing } from "@/components/landing/Pricing";
import { WhyUs } from "@/components/landing/WhyUs";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { SignupTrial } from "@/components/landing/SignupTrial";
import { TrialSignupModal } from "@/components/landing/TrialSignupModal";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  const [trialOpen, setTrialOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onStartTrial={() => setTrialOpen(true)} />
      <main>
        <Hero onStartTrial={() => setTrialOpen(true)} />
        <Features />
        <Showcase />
        <Pricing />
        <SignupTrial onStartTrial={() => setTrialOpen(true)} />
        <WhyUs />
        <Faq />
        <BottomCTA />
      </main>
      <TrialSignupModal open={trialOpen} onOpenChange={setTrialOpen} />
      <Footer />
    </div>
  );
}
