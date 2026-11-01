import { useState } from 'react'

import { PageHead } from '../../components/kit'
import { Empty, ErrorBox, Spinner, Tabs } from '../../components/ui'
import { useApi } from '../../hooks'
import { RequestCard } from './shared'

/** Every request a manager has sent this vendor, newest work first. */
export default function VendorRequests() {
  const { data, error, loading, reload } = useApi('/api/vendor-portal/requests')
  const [tab, setTab] = useState('New')

  if (loading) return <Spinner label="Fetching your requests" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const c = data.counts
  const shown = tab === 'All' ? data.requests : data.requests.filter((r) => r.state === tab)

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Requests"
        title="Requests to quote"
        sub="Each one is a wedding a manager wants you for. Price it line by line here — it lands in their comparison straight away, in the same shape as everyone else's."
      />
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'New', label: 'Needs your price', count: c.New || 0 },
        { id: 'Submitted', label: 'Submitted', count: c.Submitted || 0 },
        { id: 'Won', label: 'Won', count: c.Won || 0 },
        { id: 'Not selected', label: 'Not selected', count: c['Not selected'] || 0 },
        { id: 'Declined', label: 'Declined', count: c.Declined || 0 },
        { id: 'All', label: 'All', count: data.requests.length },
      ]} />
      {shown.length === 0 ? (
        <Empty title="Nothing here" hint={tab === 'New' ? 'No requests are waiting for a price.' : 'Try another tab.'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {shown.map((r) => <RequestCard key={r.quote_id} r={r} />)}
        </div>
      )}
    </div>
  )
}
