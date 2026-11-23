import { ArrowDownLeft, ArrowUpRight, MoreHorizontal, Plus, WalletCards } from "lucide-react";

const transactions = [
  { name: "Office supplies", date: "Today, 10:42 AM", amount: "− ৳12,450", type: "out" },
  { name: "Client payment", date: "Yesterday, 3:18 PM", amount: "+ ৳84,000", type: "in" },
  { name: "Cloud services", date: "Mar 18, 11:06 AM", amount: "− ৳6,200", type: "out" },
];

export default function BankingPreview() {
  return (
    <div className="banking-preview" aria-label="Illustrative business banking dashboard">
      <div className="preview-topbar">
        <div className="preview-window-dots"><i /><i /><i /></div>
        <span>northstar business</span>
        <span className="preview-live"><i /> Sample preview</span>
      </div>
      <div className="preview-layout">
        <aside className="preview-sidebar" aria-label="Sample dashboard navigation">
          <div className="preview-side-logo"><span><WalletCards size={17} /></span><b>Workspace</b></div>
          <span className="preview-side-label">WORKSPACE</span>
          <div className="preview-side-item selected"><span>▦</span> Overview</div>
          <div className="preview-side-item"><span>▣</span> Accounts</div>
          <div className="preview-side-item"><span>⇄</span> Transfers</div>
          <div className="preview-side-item"><span>▤</span> Transactions</div>
          <div className="preview-side-bottom"><span className="preview-avatar">NS</span><span><b>Sample account</b><small>Illustrative data</small></span><MoreHorizontal size={17} /></div>
        </aside>

        <div className="preview-main">
          <div className="preview-heading">
            <div><span className="preview-eyebrow">MONDAY, MARCH 23, 2026</span><h3>Good morning, there <span>✦</span></h3><p>Here’s your business at a glance.</p></div>
            <span className="preview-date">Last 30 days⌄</span>
          </div>

          <div className="preview-metrics">
            <article className="preview-balance-card"><div className="preview-card-title">Total balance <span>•••</span></div><strong>৳ 248,560<span>.00</span></strong><div className="preview-balance-foot"><span>BDT account</span><span className="preview-growth">↗ 8.2% <small>this month</small></span></div><div className="preview-balance-glow" /></article>
            <article className="preview-metric-card"><span className="preview-metric-icon incoming"><ArrowDownLeft size={16} /></span><span className="preview-metric-label">Money in</span><strong>৳ 96,400</strong><small>Across 12 transactions</small><span className="preview-metric-trend">↗ 12.4%</span></article>
            <article className="preview-metric-card"><span className="preview-metric-icon outgoing"><ArrowUpRight size={16} /></span><span className="preview-metric-label">Money out</span><strong>৳ 38,250</strong><small>Across 8 transactions</small><span className="preview-metric-trend muted">This month</span></article>
          </div>

          <div className="preview-lower-grid">
            <section className="preview-panel preview-activity">
              <div className="preview-panel-heading"><div><h4>Cash flow</h4><p>Income and expenses · Sample data</p></div><span className="preview-panel-menu" aria-hidden="true"><MoreHorizontal size={18} /></span></div>
              <div className="preview-chart-legend"><span><i className="legend-in" />Income</span><span><i className="legend-out" />Expenses</span></div>
              <div className="preview-chart" role="img" aria-label="Illustrative bar chart of sample income and expenses over six months">
                {[['Jan','49','30'],['Feb','67','42'],['Mar','54','35'],['Apr','82','47'],['May','63','39'],['Jun','92','51']].map(([month, income, expense]) => <div className="preview-chart-col" key={month}><div className="preview-bars"><i style={{ height: `${income}%` }} /><i style={{ height: `${expense}%` }} /></div><small>{month}</small></div>)}
              </div>
            </section>

            <section className="preview-panel preview-transactions">
              <div className="preview-panel-heading"><div><h4>Recent activity</h4><p>Sample transactions</p></div><span className="preview-panel-menu" aria-hidden="true"><Plus size={17} /></span></div>
              {transactions.map((transaction) => <div className="preview-transaction" key={transaction.name}><span className={`preview-transaction-icon ${transaction.type}`}>{transaction.type === "in" ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}</span><span className="preview-transaction-name"><b>{transaction.name}</b><small>{transaction.date}</small></span><strong className={transaction.type}>{transaction.amount}</strong></div>)}
            </section>
          </div>
        </div>
      </div>
      <div className="preview-sample-note">Illustrative sample data · Not a real customer account</div>
    </div>
  );
}
