import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Showcase } from "@/components/landing/Showcase";
import { Pricing } from "@/components/landing/Pricing";
import { WhyUs } from "@/components/landing/WhyUs";
import { BottomCTA } from "@/components/landing/BottomCTA";
import { SignupTrial } from "@/components/landing/SignupTrial";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";

import { TargetAudiences } from "@/components/landing/TargetAudiences";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <Features />
        <TargetAudiences />
        <Showcase />
        <Pricing />
        <SignupTrial />
        <WhyUs />
        <Faq />
        <BottomCTA />
      </main>
      <Footer />
    </div>
  );
}
