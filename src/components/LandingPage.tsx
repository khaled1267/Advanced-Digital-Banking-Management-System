import Link from "next/link";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Banknote,
  BriefcaseBusiness, Building2, Check, ChevronRight, Clock3, CreditCard,
  FileDown, FileSpreadsheet, Landmark, LockKeyhole, RefreshCw, ShieldCheck,
  UsersRound, Wallet, WalletCards,
} from "lucide-react";
import BankingPreview from "@/components/BankingPreview";
import LandingNav from "@/components/LandingNav";

const features = [
  { icon: WalletCards, title: "Account management", description: "Keep your banking accounts and balances organized in one place." },
  { icon: ArrowUpRight, title: "Fund transfers", description: "Move funds between accounts with validated transfer requests." },
  { icon: Banknote, title: "Deposit management", description: "Submit deposit requests and follow their progress." },
  { icon: ArrowDownLeft, title: "Withdrawal management", description: "Request withdrawals and track each request through review." },
  { icon: BriefcaseBusiness, title: "Loan management", description: "Apply for loans and follow review, approval and repayment details." },
  { icon: RefreshCw, title: "Transaction history", description: "Review account activity with clear transaction records." },
  { icon: FileDown, title: "PDF statements", description: "Download account statements as portable PDF documents." },
  { icon: FileSpreadsheet, title: "CSV statements", description: "Export statement data as CSV for your records." },
];

const roles = [
  { name: "Customer", icon: UsersRound, label: "YOUR EVERYDAY BANKING", items: ["View accounts and transactions", "Request deposits and withdrawals", "Apply for loans and track statements"] },
  { name: "Staff", icon: BriefcaseBusiness, label: "CUSTOMER OPERATIONS", items: ["Register customers and create accounts", "Review banking requests", "Review and forward loan applications"] },
  { name: "Admin", icon: Building2, label: "PLATFORM OVERSIGHT", items: ["Manage users and accounts", "Review and manage loan applications", "Monitor banking activities"] },
];

export default function LandingPage() {
  return (
    <main className="landing-page" id="home">
      <LandingNav />

      <section className="landing-hero">
        <div className="landing-hero-wash" />
        <div className="landing-container landing-hero-copy">
          <a className="landing-eyebrow" href="#features"><span><BadgeCheck size={13} /></span> A clearer way to do business banking <ChevronRight size={14} /></a>
          <h1>Smarter banking.<br /><span>Better business.</span></h1>
          <p>Manage accounts, payments, transfers and financial activities through one secure and convenient banking platform.</p>
          <div className="landing-hero-actions">
            <Link className="landing-button" href="/register">Get started <ArrowUpRight size={17} /></Link>
            <a className="landing-button-quiet" href="#features">Explore features <ArrowRight size={16} /></a>
          </div>
          <div className="landing-proof"><span className="landing-proof-icon"><ShieldCheck size={16} /></span><span>Thoughtful tools for your everyday banking</span><i /> <span>Built around BDT accounts</span></div>
        </div>
        <div className="landing-container landing-preview-wrap"><BankingPreview /></div>
        <div className="landing-hero-orb landing-hero-orb-one" /><div className="landing-hero-orb landing-hero-orb-two" />
      </section>

      <section className="landing-trust-strip" aria-label="Platform highlights"><div className="landing-container landing-trust-inner"><span><LockKeyhole size={16} /> Secure sign-in</span><i /><span><UsersRound size={17} /> Role-based access</span><i /><span><Check size={16} /> Validated banking requests</span><i /><span><Landmark size={17} /> Bangladesh Taka support</span></div></section>

      <section className="landing-section landing-features" id="features">
        <div className="landing-container">
          <div className="landing-section-heading"><div><span className="landing-kicker">BANKING, BROUGHT TOGETHER</span><h2>Everything your business<br className="desktop-only" /> needs to move forward.</h2></div><p>Practical tools for the everyday financial tasks that keep your business running smoothly.</p></div>
          <div className="landing-feature-grid">{features.map(({ icon: Icon, title, description }, index) => <article className="landing-feature-card" key={title}><span className={`landing-feature-icon tone-${index % 4}`}><Icon size={20} strokeWidth={1.8} /></span><span className="landing-feature-arrow"><ArrowUpRight size={16} /></span><h3>{title}</h3><p>{description}</p></article>)}</div>
        </div>
      </section>

      <section className="landing-showcase" id="solutions">
        <div className="landing-container landing-showcase-grid">
          <div className="landing-showcase-copy"><span className="landing-kicker">A CLEARER FINANCIAL PICTURE</span><h2>Your business,<br />at a glance.</h2><p>Bring account balances, recent activity and useful actions into one considered workspace. The product preview uses sample values only.</p><ul><li><Check size={16} /> See account summaries together</li><li><Check size={16} /> Follow recent transaction activity</li><li><Check size={16} /> Find common actions quickly</li></ul><Link className="landing-text-link" href="/register">Explore your banking workspace <ArrowRight size={16} /></Link></div>
          <div className="landing-showcase-art"><div className="showcase-glow" /><div className="showcase-mini-card"><div><span className="showcase-mini-icon"><Wallet size={17} /></span><span className="showcase-mini-menu">•••</span></div><small>Sample account balance</small><strong>৳ 248,560<span>.00</span></strong><div className="showcase-mini-bottom"><span>BDT · illustrative</span><span>↗ 8.2%</span></div><svg viewBox="0 0 360 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 54 C24 52 31 37 54 42 S86 51 110 31 S146 43 168 29 S209 33 231 17 S267 35 289 20 S326 14 360 3" fill="none" stroke="currentColor" strokeWidth="2.5" /><path d="M0 54 C24 52 31 37 54 42 S86 51 110 31 S146 43 168 29 S209 33 231 17 S267 35 289 20 S326 14 360 3 V70 H0Z" fill="url(#showcase-fill)" opacity=".17" /><defs><linearGradient id="showcase-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#5C80FF"/><stop offset="1" stopColor="#5C80FF" stopOpacity="0"/></linearGradient></defs></svg></div><div className="showcase-float-chip"><span><ArrowDownLeft size={15} /></span><div><small>Sample money in</small><b>৳ 84,000</b></div><i>+12.4%</i></div><div className="showcase-caption"><span><span /> Illustrative preview</span><small>No real account data</small></div></div>
        </div>
      </section>

      <section className="landing-section landing-how" id="about">
        <div className="landing-container"><div className="landing-centered-heading"><span className="landing-kicker">SIMPLE BY DESIGN</span><h2>Three steps. A clearer way forward.</h2><p>Get started with the tools you need to keep everyday banking in view.</p></div><div className="landing-step-grid"><article><span className="landing-step-number">01</span><span className="landing-step-icon"><UsersRound size={20} /></span><h3>Create an account</h3><p>Register securely to begin your customer banking journey.</p></article><div className="landing-step-connector" /><article><span className="landing-step-number">02</span><span className="landing-step-icon"><CreditCard size={20} /></span><h3>Manage banking activities</h3><p>View accounts and submit the banking requests you need.</p></article><div className="landing-step-connector" /><article><span className="landing-step-number">03</span><span className="landing-step-icon"><Clock3 size={20} /></span><h3>Track and review</h3><p>Follow transaction history and download your statements.</p></article></div></div>
      </section>

      <section className="landing-section landing-roles" aria-labelledby="roles-title"><div className="landing-container"><div className="landing-section-heading"><div><span className="landing-kicker">THE RIGHT TOOLS FOR EACH TEAM</span><h2 id="roles-title">Banking that works<br className="desktop-only" /> across every role.</h2></div><p>Each workspace is shaped around the tasks and access available to its role.</p></div><div className="landing-role-grid">{roles.map(({ name, icon: Icon, label, items }) => <article className="landing-role-card" key={name}><div className="landing-role-heading"><span><Icon size={19} /></span><span className="landing-role-label">{label}</span></div><h3>{name}</h3><ul>{items.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul></article>)}</div></div></section>

      <section className="landing-security" id="security"><div className="landing-container landing-security-grid"><div><span className="landing-kicker">SECURITY, BUILT INTO THE FLOW</span><h2>Careful access.<br /><span>Thoughtful controls.</span></h2><p>Banking actions are protected by authenticated sessions, role checks and server-side input validation throughout the application.</p><Link className="landing-security-link" href="/login">Sign in securely <ArrowRight size={16} /></Link></div><div className="landing-security-list"><article><span><LockKeyhole size={19} /></span><div><h3>HTTP-only session cookie</h3><p>Session tokens are stored in an HTTP-only cookie and verified by the application.</p></div></article><article><span><UsersRound size={19} /></span><div><h3>Role-based access</h3><p>Protected pages and banking operations check the signed-in user’s role.</p></div></article><article><span><ShieldCheck size={19} /></span><div><h3>Server-side validation</h3><p>Requests are checked against validation rules before banking operations proceed.</p></div></article></div></div></section>

      <section className="landing-cta"><div className="landing-container landing-cta-inner"><div><span>YOUR BANKING, MORE IN FOCUS</span><h2>Take control of your<br />banking experience.</h2><p>Explore a smarter way to manage your banking activities.</p></div><Link className="landing-button landing-button-light" href="/register">Get started today <ArrowUpRight size={17} /></Link><div className="landing-cta-decoration" /></div></section>

      <footer className="landing-footer"><div className="landing-container"><div className="landing-footer-main"><div className="landing-footer-brand"><Link className="landing-brand" href="/" aria-label="Northstar Bank home"><span className="landing-brand-mark"><Landmark size={19} /></span><span>northstar<span className="landing-brand-dot">.</span></span></Link><p>A thoughtful digital banking experience for managing everyday financial activities.</p></div><div className="landing-footer-column"><h3>Explore</h3><a href="#features">Features</a><a href="#solutions">Solutions</a><a href="#security">Security</a><a href="#about">About</a></div><div className="landing-footer-column"><h3>Banking tools</h3><a href="#features">Accounts & transfers</a><a href="#features">Deposits & withdrawals</a><a href="#features">Loans & transactions</a><a href="#features">Statements</a></div><div className="landing-footer-column"><h3>Your account</h3><Link href="/login">Log in</Link><Link href="/register">Create an account</Link></div></div><div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Northstar Bank. All rights reserved.</span> <div className="text-2xl font-bold ">Develop by Khaled Mahmud</div><span>Banking tools and account previews shown for illustration.</span></div></div></footer>
    </main>
  );
}
// khaled mahmud
