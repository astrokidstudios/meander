import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, touchTrip, uid, type ExpenseCategory, type Stop, type Trip } from '../db'
import { EXPENSE_CATS, fmtDate, money, stopToExpenseCat, toISODate } from '../utils'

export default function Budget({ trip, stops }: { trip: Trip; stops: Stop[] }) {
  const expenses = useLiveQuery(() => db.expenses.where('tripId').equals(trip.id).toArray(), [trip.id]) ?? []
  const [f, setF] = useState({ title: '', amount: '', category: 'food' as ExpenseCategory, date: toISODate(new Date()), paidBy: '' })
  const [includePlanned, setIncludePlanned] = useState(true)
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)

  const planned = stops.filter((s) => s.cost > 0)
  const spent = expenses.reduce((t, e) => t + e.amount, 0)
  const plannedTotal = planned.reduce((t, s) => t + s.cost, 0)
  const total = spent + (includePlanned ? plannedTotal : 0)
  const pct = trip.budget > 0 ? Math.min(100, (total / trip.budget) * 100) : 0
  const over = trip.budget > 0 && total > trip.budget

  const byCat = (Object.keys(EXPENSE_CATS) as ExpenseCategory[]).map((c) => ({
    c,
    amount: expenses.filter((e) => e.category === c).reduce((t, e) => t + e.amount, 0) + (includePlanned ? planned.filter((s) => stopToExpenseCat(s.category) === c).reduce((t, s) => t + s.cost, 0) : 0),
  })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount)
  const maxCat = Math.max(1, ...byCat.map((x) => x.amount))

  const people = [...new Set(expenses.map((e) => e.paidBy.trim()).filter(Boolean))]
  const fairShare = people.length > 1 ? spent / people.length : 0

  async function add() {
    const amount = Number(f.amount)
    if (!f.title.trim() || !amount) return
    await db.expenses.add({ id: uid(), tripId: trip.id, title: f.title.trim(), amount, category: f.category, date: f.date, paidBy: f.paidBy.trim(), createdAt: Date.now() })
    await touchTrip(trip.id)
    setF((p) => ({ ...p, title: '', amount: '' }))
  }

  return (
    <div className="budget">
      <div className="budget-hero card">
        <div className="row between wrap gap">
          <div>
            <div className="muted small">{includePlanned ? 'Spent + planned' : 'Spent so far'}</div>
            <div className={`big-num ${over ? 'over' : ''}`}>{money(total, trip.currency)}</div>
            {trip.travelers > 1 && <div className="muted small">{money(total / trip.travelers, trip.currency)} per person ({trip.travelers} travellers)</div>}
          </div>
          <div className="right">
            <div className="muted small">Budget</div>
            {budgetDraft === null ? (
              <button className="link-btn big-num sm" onClick={() => setBudgetDraft(String(trip.budget || ''))}>{trip.budget ? money(trip.budget, trip.currency) : 'Set budget'}</button>
            ) : (
              <form onSubmit={async (e) => { e.preventDefault(); await db.trips.update(trip.id, { budget: Number(budgetDraft) || 0 }); setBudgetDraft(null) }}>
                <input autoFocus type="number" min={0} className="budget-input" value={budgetDraft} onChange={(e) => setBudgetDraft(e.target.value)} onBlur={async () => { await db.trips.update(trip.id, { budget: Number(budgetDraft) || 0 }); setBudgetDraft(null) }} />
              </form>
            )}
            {trip.budget > 0 && <div className={`small ${over ? 'error' : 'muted'}`}>{over ? `${money(total - trip.budget, trip.currency)} over` : `${money(trip.budget - total, trip.currency)} left`}</div>}
          </div>
        </div>
        {trip.budget > 0 && <div className="meter"><div className={over ? 'over' : ''} style={{ width: `${pct}%` }} /></div>}
        <label className="row gap small muted toggle">
          <input type="checkbox" checked={includePlanned} onChange={(e) => setIncludePlanned(e.target.checked)} />
          Include costs entered on itinerary places ({money(plannedTotal, trip.currency)})
        </label>
      </div>

      {byCat.length > 0 && (
        <div className="card">
          <h3>By category</h3>
          {byCat.map(({ c, amount }) => (
            <div key={c} className="cat-row">
              <span>{EXPENSE_CATS[c].icon} {EXPENSE_CATS[c].label}</span>
              <div className="bar"><div style={{ width: `${(amount / maxCat) * 100}%` }} /></div>
              <span className="num">{money(amount, trip.currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h3>Add an expense</h3>
        <form className="expense-form" onSubmit={(e) => { e.preventDefault(); add() }}>
          <input placeholder="What was it?" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input type="number" min={0} step="0.01" inputMode="decimal" placeholder={`Amount (${trip.currency})`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCategory })}>
            {(Object.keys(EXPENSE_CATS) as ExpenseCategory[]).map((c) => <option key={c} value={c}>{EXPENSE_CATS[c].icon} {EXPENSE_CATS[c].label}</option>)}
          </select>
          <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input placeholder="Paid by (optional)" value={f.paidBy} onChange={(e) => setF({ ...f, paidBy: e.target.value })} list="payers" />
          <datalist id="payers">{people.map((p) => <option key={p} value={p} />)}</datalist>
          <button className="btn primary" type="submit">Add</button>
        </form>
      </div>

      {people.length > 1 && (
        <div className="card">
          <h3>Who paid what</h3>
          <p className="muted small">Even split of logged expenses: {money(fairShare, trip.currency)} each.</p>
          {people.map((p) => {
            const paid = expenses.filter((e) => e.paidBy.trim() === p).reduce((t, e) => t + e.amount, 0)
            const diff = paid - fairShare
            return (
              <div key={p} className="cat-row">
                <span>{p}</span>
                <span className="num">{money(paid, trip.currency)}</span>
                <span className={`num small ${diff >= 0 ? 'good' : 'error'}`}>{diff >= 0 ? `is owed ${money(diff, trip.currency)}` : `owes ${money(-diff, trip.currency)}`}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="card">
        <h3>Expenses</h3>
        {expenses.length === 0 && <p className="muted small">No expenses logged yet.</p>}
        <ul className="expense-list">
          {[...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).map((e) => (
            <li key={e.id}>
              <span className="exp-icon">{EXPENSE_CATS[e.category]?.icon}</span>
              <div className="grow">
                <div>{e.title}</div>
                <div className="muted small">{fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })}{e.paidBy ? ` · ${e.paidBy}` : ''}</div>
              </div>
              <span className="num">{money(e.amount, trip.currency)}</span>
              <button className="icon-btn sm" aria-label="Delete expense" onClick={() => db.expenses.delete(e.id)}>✕</button>
            </li>
          ))}
        </ul>
        {includePlanned && planned.length > 0 && (
          <>
            <h4 className="muted">From the itinerary</h4>
            <ul className="expense-list">
              {planned.map((s) => (
                <li key={s.id}>
                  <span className="exp-icon">{EXPENSE_CATS[stopToExpenseCat(s.category)].icon}</span>
                  <div className="grow"><div>{s.name}</div><div className="muted small">{s.day === null ? 'Saved place' : `Day ${s.day + 1}`}</div></div>
                  <span className="num">{money(s.cost, trip.currency)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
