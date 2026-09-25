import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL } from '../lib/socket'
import { errorText, useAuth, type User } from '../lib/auth'

type Row = User & { lastLoginAt: string | null }

function fmt(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '–'
}

/** Admin: users, and a manual Premium switch until payments are connected. */
export default function Admin() {
  const { access, loading } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState<{ total: number; premium: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = () =>
    axios
      .get(`${API_URL}/admin/users`)
      .then(r => {
        setRows(r.data.data)
        setStats(r.data.stats)
        setError(null)
      })
      .catch(e => setError(errorText(e)))

  useEffect(() => {
    if (access === 'admin') load()
  }, [access])

  if (loading) return null
  if (access !== 'admin') return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted">Admins only.</div>

  const setPlan = async (u: Row, plan: 'free' | 'premium') => {
    let until: string | null = null
    if (plan === 'premium') {
      const days = window.prompt(`Premium for ${u.email}: number of days (empty = no end date)`, '30')
      if (days === null) return
      const n = parseInt(days, 10)
      if (n > 0) until = new Date(Date.now() + n * 86400000).toISOString()
    }
    try {
      await axios.post(`${API_URL}/admin/users/${u.id}/plan`, { plan, until })
      load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const resetPw = async (u: Row) => {
    const pw = window.prompt(`New temporary password for ${u.email} (min 8 characters)`)
    if (!pw) return
    try {
      await axios.post(`${API_URL}/admin/users/${u.id}/password`, { password: pw })
      setError(null)
      window.alert('Password changed. Send it to the user privately and ask them to change it in Account.')
    } catch (e) {
      setError(errorText(e))
    }
  }

  const shown = rows.filter(r => !q || r.email.includes(q.toLowerCase()) || (r.name || '').toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Users</h1>
          {stats && (
            <p className="text-sm text-muted">
              <span className="num">{stats.total}</span> accounts · <span className="num">{stats.premium}</span> premium
            </p>
          )}
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search email or name"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent w-64 max-w-full"
        />
      </div>
      {error && <div className="mb-4 rounded-xl border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-faint text-xs border-b border-line">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(u => (
              <tr key={u.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="text-ink">{u.email}</div>
                  {u.name && <div className="text-xs text-faint">{u.name}</div>}
                </td>
                <td className="px-4 py-3">
                  {u.isAdmin ? (
                    <span className="text-xs font-semibold text-accent">Admin</span>
                  ) : u.plan === 'premium' ? (
                    <span className="text-xs font-semibold text-accent">
                      Premium{u.premiumUntil ? <span className="text-faint font-normal"> · until {fmt(u.premiumUntil)}</span> : null}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">Free</span>
                  )}
                </td>
                <td className="px-4 py-3 num text-muted">{fmt(u.createdAt)}</td>
                <td className="px-4 py-3 num text-muted">{fmt(u.lastLoginAt)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!u.isAdmin &&
                    (u.plan === 'premium' ? (
                      <button onClick={() => setPlan(u, 'free')} className="text-xs text-muted hover:text-loss mr-3">
                        Remove premium
                      </button>
                    ) : (
                      <button onClick={() => setPlan(u, 'premium')} className="text-xs font-semibold text-accent mr-3">
                        Give premium
                      </button>
                    ))}
                  <button onClick={() => resetPw(u)} className="text-xs text-muted hover:text-ink">
                    Reset password
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-faint">
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
