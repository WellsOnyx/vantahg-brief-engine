import type { Metadata } from 'next';
import type { CSSProperties, ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How VantaUM, a Wells Onyx company, collects, uses, and protects information through vantaum.com and our services.',
};

const EFFECTIVE_DATE = 'August 12, 2026';
const CONTACT_EMAIL = 'hello@wellsonyx.com';

export default function PrivacyPolicyPage() {
  return (
    <main
      style={{
        background: '#0c2340',
        color: '#e8ecf3',
        minHeight: '100vh',
        padding: '64px 20px 96px',
      }}
    >
      <article style={{ maxWidth: 760, margin: '0 auto', lineHeight: 1.7, fontSize: 16 }}>
        <a
          href="/"
          style={{ color: '#c9a227', textDecoration: 'none', fontSize: 14, letterSpacing: '0.02em' }}
        >
          ← VantaUM
        </a>

        <h1
          style={{
            fontFamily: '"DM Serif Display", Georgia, serif',
            fontSize: 44,
            lineHeight: 1.1,
            margin: '24px 0 8px',
            color: '#ffffff',
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ color: '#9fb0c7', margin: '0 0 40px', fontSize: 14 }}>
          Effective date: {EFFECTIVE_DATE}
        </p>

        <p>
          This Privacy Policy explains how VantaUM, a Wells Onyx company (“VantaUM,” “we,” “us,” or
          “our”), collects, uses, discloses, and safeguards information when you visit{' '}
          <strong>vantaum.com</strong> (the “Site”), contact us, request a demonstration, or otherwise
          interact with our marketing and business communications. Please read this policy carefully.
          By using the Site, you agree to the practices described here.
        </p>

        <Section title="1. Who we are">
          <p>
            VantaUM provides a concierge utilization-management and clinical-intelligence service for
            third-party administrators (TPAs), health plans, and self-funded employers. This policy
            governs the information we handle through our public website and business interactions. It
            is not a Notice of Privacy Practices under the Health Insurance Portability and
            Accountability Act (“HIPAA”). See Section 9 regarding protected health information.
          </p>
        </Section>

        <Section title="2. Scope of this policy">
          <p>
            This policy applies to information collected through the Site and our sales, marketing, and
            support activities. It does <strong>not</strong> apply to information we process on behalf
            of our clients within our operational platform, which is governed by our agreements with
            those clients (including Business Associate Agreements) and by applicable law.
          </p>
        </Section>

        <Section title="3. Information we collect">
          <p>We collect the following categories of information:</p>
          <ul style={ulStyle}>
            <li>
              <strong>Information you provide.</strong> When you contact us, request a demo, subscribe
              to updates, or complete a form (including advertising lead forms), we collect details such
              as your name, business email address, company, job title, phone number, and the contents
              of your message.
            </li>
            <li>
              <strong>Information collected automatically.</strong> When you visit the Site, we and our
              service providers may automatically collect technical and usage information such as your
              IP address, device and browser type, pages viewed, referring URLs, and interaction data,
              through cookies and similar technologies.
            </li>
            <li>
              <strong>Information from advertising and analytics partners.</strong> If you reach us
              through an advertisement (for example, on LinkedIn), we may receive limited information
              about that interaction, such as the campaign you engaged with and, where you have provided
              it, contact details submitted through the platform’s lead form.
            </li>
          </ul>
          <p>
            We do not intentionally collect protected health information or other sensitive personal
            information through the Site. Please do not submit such information through website forms.
          </p>
        </Section>

        <Section title="4. How we use information">
          <p>We use the information we collect to:</p>
          <ul style={ulStyle}>
            <li>respond to your inquiries and provide the information or demonstrations you request;</li>
            <li>operate, maintain, secure, and improve the Site and our services;</li>
            <li>
              communicate with you about our services, including marketing communications you may opt out
              of at any time;
            </li>
            <li>measure and improve the performance of our marketing and advertising;</li>
            <li>detect, prevent, and address fraud, security, and technical issues; and</li>
            <li>comply with legal obligations and enforce our agreements.</li>
          </ul>
        </Section>

        <Section title="5. Cookies, analytics, and advertising">
          <p>
            We and our partners use cookies, pixels, tags, and similar technologies to operate the Site,
            understand how it is used, and measure and deliver advertising. This may include analytics
            providers and advertising platforms such as <strong>LinkedIn</strong> (for example, the
            LinkedIn Insight Tag) and similar services. These partners may set cookies that help us and
            them understand ad performance and show you relevant advertising on their platforms.
          </p>
          <p>
            You can control cookies through your browser settings and can opt out of interest-based
            advertising through tools offered by the platforms and industry programs, including the{' '}
            <a href="https://optout.aboutads.info" style={linkStyle} target="_blank" rel="noopener noreferrer">
              Digital Advertising Alliance
            </a>{' '}
            and each platform’s own ad-settings controls (for example, LinkedIn’s advertising
            preferences). Disabling cookies may affect Site functionality.
          </p>
        </Section>

        <Section title="6. How we share information">
          <p>We do not sell your personal information. We may share information:</p>
          <ul style={ulStyle}>
            <li>
              <strong>with service providers</strong> that perform functions on our behalf (such as
              hosting, analytics, email, and advertising measurement), under contractual confidentiality
              and data-protection obligations;
            </li>
            <li>
              <strong>with advertising and analytics partners</strong> as described in Section 5;
            </li>
            <li>
              <strong>for legal reasons,</strong> where required to comply with law, regulation, legal
              process, or governmental request, or to protect the rights, property, or safety of VantaUM,
              our users, or others; and
            </li>
            <li>
              <strong>in a business transaction,</strong> such as a merger, acquisition, financing, or
              sale of assets, in which case information may be transferred as a business asset.
            </li>
          </ul>
        </Section>

        <Section title="7. Protected health information (HIPAA)">
          <p>
            In providing utilization-management services to our clients, VantaUM may act as a “business
            associate” and process protected health information (“PHI”) on their behalf. That PHI is
            handled in accordance with HIPAA, our Business Associate Agreements, and our clients’
            instructions — <strong>not</strong> under this website policy. This Site is not intended for
            the submission of PHI, and individuals seeking information about the use of their health
            information should contact their health plan or provider.
          </p>
        </Section>

        <Section title="8. Data security">
          <p>
            We maintain administrative, technical, and physical safeguards designed to protect the
            information we hold against loss, misuse, and unauthorized access, disclosure, alteration,
            and destruction. No method of transmission or storage is completely secure, and we cannot
            guarantee absolute security.
          </p>
        </Section>

        <Section title="9. Data retention">
          <p>
            We retain information for as long as necessary to fulfill the purposes described in this
            policy, to comply with our legal obligations, resolve disputes, and enforce our agreements,
            after which we delete or de-identify it.
          </p>
        </Section>

        <Section title="10. Your privacy rights">
          <p>
            Depending on where you live, you may have rights to access, correct, delete, or port your
            personal information, to opt out of certain processing (including targeted advertising and
            the “sale” or “sharing” of personal information as those terms are defined under laws such as
            the California Consumer Privacy Act), and to withdraw consent. Residents of the European
            Economic Area and the United Kingdom may have rights under the GDPR and UK GDPR. To exercise
            any right, contact us using the details below. We will not discriminate against you for
            exercising these rights, and we will respond as required by applicable law.
          </p>
        </Section>

        <Section title="11. Do Not Track">
          <p>
            Some browsers offer a “Do Not Track” signal. Because there is no common industry standard for
            interpreting these signals, we do not currently respond to them. We honor the cookie and
            advertising controls described in Section 5.
          </p>
        </Section>

        <Section title="12. Children’s privacy">
          <p>
            The Site is intended for a business audience and is not directed to children. We do not
            knowingly collect personal information from children under 16. If you believe a child has
            provided us information, please contact us and we will take appropriate steps to delete it.
          </p>
        </Section>

        <Section title="13. International users">
          <p>
            We operate in the United States, and information we collect is processed and stored in the
            United States. If you access the Site from outside the United States, you understand that
            your information may be transferred to and processed in the United States, where data
            protection laws may differ from those in your jurisdiction.
          </p>
        </Section>

        <Section title="14. Third-party links">
          <p>
            The Site may link to third-party websites and services that we do not control. This policy
            does not apply to those third parties, and we encourage you to review their privacy policies.
          </p>
        </Section>

        <Section title="15. Changes to this policy">
          <p>
            We may update this policy from time to time. When we do, we will revise the “Effective date”
            above and, where appropriate, provide additional notice. Your continued use of the Site after
            an update constitutes acceptance of the revised policy.
          </p>
        </Section>

        <Section title="16. Contact us">
          <p>
            If you have questions about this policy or our privacy practices, or wish to exercise a
            privacy right, contact us at:
          </p>
          <p style={{ margin: '12px 0 0' }}>
            <strong>VantaUM</strong>, a Wells Onyx company
            <br />
            <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>
              {CONTACT_EMAIL}
            </a>
          </p>
        </Section>

        <p style={{ color: '#6f829b', fontSize: 13, marginTop: 56 }}>
          © 2026 VantaUM. All rights reserved.
        </p>
      </article>
    </main>
  );
}

const ulStyle: CSSProperties = { paddingLeft: 22, margin: '12px 0' };
const linkStyle: CSSProperties = { color: '#c9a227', textDecoration: 'underline' };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 36 }}>
      <h2
        style={{
          fontFamily: '"DM Serif Display", Georgia, serif',
          fontSize: 22,
          color: '#ffffff',
          margin: '0 0 10px',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}
