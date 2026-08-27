import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What information DishFrame collects, how sharing works, and how to export or delete your account data.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    url: "/privacy",
    title: "Privacy Policy | DishFrame",
    description:
      "What information DishFrame collects, how sharing works, and how to export or delete your account data.",
  },
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      effectiveDate="August 27, 2026"
      intro="DishFrame is a personal cooking framework built and operated as a small, independent software product. This page explains what information DishFrame collects, why, how it may be shared when you choose to use DishFrame's sharing features, and how you can export or delete it."
    >
      <section>
        <h2>Information collected through sign-in</h2>
        <p>
          DishFrame uses Google Sign-In for authentication. When you sign in,
          DishFrame receives your name, email address, and profile image from
          Google, and stores them to identify your account. DishFrame does not
          receive or store your Google password.
        </p>
      </section>

      <section>
        <h2>Content you create</h2>
        <p>
          DishFrame stores the content you create in order to provide the
          product, including Recipes, Parts, Recipe Versions, Cooking Sessions,
          notes, ratings, Reviews, Tasters, Meal Plans, grocery lists, tags, and
          preferences.
        </p>
        <p>
          Your content is private to your account by default. DishFrame only
          makes content available to other people when you choose to use its
          direct-sharing or public-link publishing features.
        </p>
        <p>
          Images you upload are stored using Vercel Blob, a cloud file storage
          service. Images associated with private content are used within your
          DishFrame account. If you choose to publish content through a public
          link, images included with that published content may also be visible
          through that link.
        </p>
      </section>

      <section>
        <h2>Sharing between accounts</h2>
        <p>
          If you share a Recipe or Part directly with another DishFrame account,
          or send it to an email address that doesn&rsquo;t yet have an account,
          DishFrame stores the recipient&rsquo;s email address to match it
          against the verified Google email used at sign-in. This lets a pending
          share reach the right person once they sign in — it does not cause
          DishFrame to send that address any email or notification on your
          behalf.
        </p>
        <p>
          A recipient who accepts a shared Recipe or Part receives their own
          independent copy. Later changes you make to your original do not
          affect their copy, and later changes they make do not affect yours. If
          you later delete your original content or your DishFrame account, a
          copy that another user already accepted remains part of that
          user&rsquo;s account.
        </p>
      </section>

      <section>
        <h2>Public links</h2>
        <p>
          You can choose to publish a Recipe or Part through a public DishFrame
          link. Anyone who has access to that link may be able to view the
          published content without signing in to DishFrame.
        </p>
        <p>
          Depending on the options you choose when publishing, a public link may
          show either a fixed Version of the content or the current Version as
          it changes over time. You may also choose whether your creator name is
          shown with the publication.
        </p>
        <p>
          Public links can be revoked, and some links may be configured to
          expire. Revoking or allowing a link to expire prevents continued
          access through that DishFrame link, but DishFrame cannot undo copies,
          screenshots, downloads, or other use of information that someone may
          already have viewed outside DishFrame.
        </p>
        <p>
          Public publication is always optional. Content that you do not choose
          to share or publish remains private to your account.
        </p>
      </section>

      <section>
        <h2>Contact form submissions</h2>
        <p>
          If you use the <Link href="/contact">Contact page</Link>, the name,
          email address, and message you submit are sent by email (via Resend,
          an email delivery service) so DishFrame can read and reply to your
          message. Contact submissions are not stored in DishFrame&rsquo;s
          database — they exist only as that email.
        </p>
      </section>

      <section>
        <h2>Account sessions and security</h2>
        <p>
          DishFrame keeps a record of your active sign-in sessions, including an
          approximate IP address and browser/device information, so you can view
          and revoke sessions from another device and so DishFrame can detect
          suspicious activity.
        </p>
      </section>

      <section>
        <h2>Nutrition lookups</h2>
        <p>
          If you search for nutrition information while building a Recipe or
          Part, your search terms are sent to USDA FoodData Central, a public
          U.S. government nutrition database, to retrieve matching results. No
          account or personal information is included in these requests.
        </p>
      </section>

      <section>
        <h2>Infrastructure and hosting</h2>
        <p>
          DishFrame is hosted on Vercel and stores its data in a Neon PostgreSQL
          database. These providers process ordinary operational data — such as
          request logs and performance metrics — needed to run the application
          reliably. DishFrame does not install third-party advertising or
          analytics trackers, and does not use cookies beyond the ones required
          to keep you signed in.
        </p>
      </section>

      <section>
        <h2>Exporting your data</h2>
        <p>
          You can download a structured export of your own account data —
          including Recipes, Parts, Versions, Cooking Sessions, related content,
          and metadata about active public publications — as a JSON file from
          your account settings at any time.
        </p>
        <p>
          Public-link secrets are not included in the export. The export also
          does not currently include image files.
        </p>
      </section>

      <section>
        <h2>Deleting your account</h2>
        <p>
          You can permanently delete your account from your account settings.
          Deleting your account removes your Recipes, Parts, Versions, Cooking
          Sessions, Reviews, Tasters, ratings, grocery lists, Meal Plans,
          images, public share links, pending direct shares, and preferences
          from DishFrame.
        </p>
        <p>
          Database records are removed immediately as part of account deletion.
          Uploaded image files are deleted from storage on a best-effort basis
          immediately afterward, which may take a short time to complete fully.
        </p>
        <p>
          Public links associated with your account stop being available once
          their underlying DishFrame records are removed. If another DishFrame
          user has already accepted an independent copy of something you shared,
          that copy remains theirs and is not deleted with your account.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          DishFrame takes reasonable measures to protect your information, but
          no online service can guarantee complete security. You&rsquo;re
          responsible for keeping access to your Google account secure, since it
          controls sign-in to DishFrame.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          DishFrame may update this policy as the product changes. Material
          changes will update the effective date at the top of this page.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about this policy or your data can be sent through the{" "}
          <Link href="/contact">Contact page</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}
