import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const CONTACT = 'contact@bettobeat.com'
const UPDATED = '25 September 2026'

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{title}</h1>
      <p className="text-xs text-faint mt-2">Last updated {UPDATED}</p>
      <div className="mt-8 space-y-7 text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg font-bold text-ink mb-2">{title}</h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

const Mail = () => (
  <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
    {CONTACT}
  </a>
)

export function Terms() {
  return (
    <Page title="Terms of use">
      <Section title="What Bet To Beat is">
        <p>
          Bet To Beat publishes football statistics and match predictions made by our own models, together with live scores, match
          statistics and bookmaker odds from third-party data providers. Predictions are probabilities, not promises: any match can end in
          any result.
        </p>
      </Section>
      <Section title="Not betting advice">
        <p>
          Everything on the site is information and analysis. It is not financial or betting advice, and we do not take bets or pass bets
          to anyone. If you choose to bet, you do so at your own risk and under the laws where you live. Past accuracy, backtests and
          "profit per 100" figures describe the past and do not guarantee future results.
        </p>
      </Section>
      <Section title="18+ only">
        <p>
          You must be at least 18 years old (or the legal age for gambling where you live, if higher) to create an account. If gambling
          stops being fun, stop, and get help, for example from{' '}
          <a href="https://www.begambleaware.org" target="_blank" rel="noreferrer" className="text-accent hover:underline">
            BeGambleAware
          </a>{' '}
          or a local support service.
        </p>
      </Section>
      <Section title="Your account">
        <p>
          Keep your password to yourself; you are responsible for what happens under your account. We may suspend accounts that abuse the
          service. You can close your account at any time by writing to <Mail />.
        </p>
      </Section>
      <Section title="Premium">
        <p>
          Premium opens extra features (full probabilities, the model breakdown, draw alerts, accuracy pages). Prices, billing and refund
          terms will be shown before you pay. Payments are handled by a payment provider; we never see or store your card details.
        </p>
      </Section>
      <Section title="Fair use">
        <p>
          Do not copy, scrape, resell or republish our predictions or data in bulk, and do not try to break or overload the site. Personal
          use and sharing the odd screenshot with friends is fine.
        </p>
      </Section>
      <Section title="Data from others">
        <p>
          Fixtures, scores, statistics, lineups and odds come from third-party providers and can be late or wrong. Team names and crests
          belong to their owners and are shown only to identify the teams.
        </p>
      </Section>
      <Section title="Liability">
        <p>
          The service is provided "as is". To the extent the law allows, we are not liable for losses from using the site or relying on
          its content, including betting losses.
        </p>
      </Section>
      <Section title="Changes and contact">
        <p>
          We may update these terms; the date above shows the latest version. Questions: <Mail />. See also our{' '}
          <Link to="/privacy" className="text-accent hover:underline">
            privacy policy
          </Link>
          .
        </p>
      </Section>
    </Page>
  )
}

export function Privacy() {
  return (
    <Page title="Privacy policy">
      <Section title="What we collect">
        <p>
          <span className="text-ink font-semibold">Account:</span> your email address and a scrambled (hashed) version of your password.
          We never store the password itself. We also store whether you confirmed your email, your plan, and whether you asked for update
          emails, with the date you chose it.
        </p>
        <p>
          <span className="text-ink font-semibold">Security:</span> the IP address of sign-in and sign-up attempts, to stop password
          guessing. Server logs keep the pages requested, for troubleshooting.
        </p>
        <p>
          <span className="text-ink font-semibold">Cookies:</span> one cookie that keeps you signed in (required for accounts to work).
          Your theme choice (dark / light) is stored in your browser. We use no advertising or tracking cookies.
        </p>
      </Section>
      <Section title="What we use it for">
        <p>
          To run your account, send the codes that confirm your email or reset your password, keep the site secure, and, only if you ticked
          the box, send occasional updates. You can switch updates off in your account at any time.
        </p>
      </Section>
      <Section title="Who else handles it">
        <p>
          Our hosting provider (Railway) runs the servers and database. Our email provider (Resend) sends the confirmation and reset
          emails. When payments launch, the payment provider will handle billing. We do not sell your data or share it with advertisers.
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          For as long as your account exists. Confirmation and reset codes expire within minutes. If you close your account, we delete your
          details, except where the law requires us to keep records (for example, payment records).
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          You can ask to see, correct, export or delete your data, or object to how we use it, by writing to <Mail />. We answer within 30
          days.
        </p>
      </Section>
      <Section title="Changes">
        <p>
          If we change this policy, the date above changes; for important changes we will tell signed-in users. See also our{' '}
          <Link to="/terms" className="text-accent hover:underline">
            terms of use
          </Link>
          .
        </p>
      </Section>
    </Page>
  )
}

export function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="font-display text-6xl font-extrabold text-accent">404</div>
      <p className="text-ink font-semibold mt-3">This page doesn't exist.</p>
      <p className="text-sm text-muted mt-1">The link may be old, or the match may have been removed.</p>
      <Link to="/" className="inline-block mt-6 px-4 py-2 rounded-xl bg-accent text-bg font-semibold text-sm">
        Back to home
      </Link>
    </div>
  )
}
