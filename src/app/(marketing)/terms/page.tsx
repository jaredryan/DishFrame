import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "The terms for using DishFrame, a personal cooking framework for building, cooking, and improving your Recipes.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    url: "/terms",
    title: "Terms of Use | DishFrame",
    description:
      "The terms for using DishFrame, a personal cooking framework for building, cooking, and improving your Recipes.",
  },
};

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Use"
      effectiveDate="August 5, 2026"
      intro="These terms cover how DishFrame may be used. By creating an account or using DishFrame, you agree to them."
    >
      <section>
        <h2>Accounts</h2>
        <p>
          You need a Google account to sign in to DishFrame. You&rsquo;re
          responsible for the activity that happens under your account and
          for keeping your Google account secure. Let DishFrame know through
          the <Link href="/contact">Contact page</Link> if you believe your
          account has been accessed without your permission.
        </p>
      </section>

      <section>
        <h2>Your Recipes and content</h2>
        <p>
          You own the Recipes, Parts, notes, images, and other content you
          create in DishFrame. By using DishFrame, you give DishFrame the
          limited permission needed to store, process, display, copy, and
          share that content back to you — and, when you choose to share it,
          to the recipients you direct it to — as part of operating the
          product. DishFrame doesn&rsquo;t claim ownership of your content and
          doesn&rsquo;t use it for anything beyond providing DishFrame to you.
        </p>
        <p>
          You&rsquo;re responsible for content you submit or share, including
          making sure you have the right to share anything you upload or
          send to another DishFrame user.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You agree not to use DishFrame to:</p>
        <ul>
          <li>access or attempt to access another account without permission;</li>
          <li>upload malicious files or content designed to disrupt the service;</li>
          <li>interfere with or overload DishFrame&rsquo;s infrastructure;</li>
          <li>use DishFrame for any unlawful purpose.</li>
        </ul>
        <p>
          DishFrame may suspend or terminate access for accounts that violate
          these terms.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          DishFrame relies on third-party services to operate, including
          Google (authentication), Vercel and Neon (hosting and data
          storage), Resend (contact-form email), and USDA FoodData Central
          (nutrition lookups). DishFrame isn&rsquo;t responsible for the
          availability or behavior of these external services.
        </p>
      </section>

      <section>
        <h2>Changes and interruptions</h2>
        <p>
          DishFrame is an independently operated, still-evolving product.
          Features may change, and the service may occasionally be
          unavailable for maintenance or due to circumstances outside
          DishFrame&rsquo;s control. DishFrame doesn&rsquo;t guarantee
          uninterrupted availability.
        </p>
      </section>

      <section>
        <h2>Account deletion and suspension</h2>
        <p>
          You may delete your account at any time from your account
          settings; see the <Link href="/privacy">Privacy Policy</Link> for
          what deletion removes. DishFrame may suspend or delete an account
          that violates these terms.
        </p>
      </section>

      <section>
        <h2>Recipe, nutrition, and food-safety disclaimer</h2>
        <p>
          Recipes, nutrition information, and cooking guidance in DishFrame
          — whether entered by you, by another user, or retrieved from USDA
          FoodData Central — are provided for informational and personal use
          only. DishFrame doesn&rsquo;t verify the accuracy of nutrition data
          or guarantee that any Recipe is safe for a particular diet,
          allergy, or health condition. Use your own judgment about food
          safety, ingredient substitutions, allergens, and doneness when
          cooking. Consult a qualified professional for medical or dietary
          advice.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          DishFrame is provided &ldquo;as is,&rdquo; without warranties of any
          kind. To the fullest extent permitted by law, DishFrame and its
          operator aren&rsquo;t liable for indirect, incidental, or
          consequential damages arising from your use of the service,
          including any loss of data, recipes, or content.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>
          These terms may be updated as DishFrame changes. Material changes
          will update the effective date at the top of this page.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent through the{" "}
          <Link href="/contact">Contact page</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}
