import { useState } from 'react'

import { api } from '../../api'
import { EditModal, PageHead } from '../../components/kit'
import { Empty, ErrorBox, Spinner, Tabs, useToast } from '../../components/ui'
import { useApi } from '../../hooks'
import { JobCard, UpdateModal } from './shared'

/** Every wedding this vendor is contracted for — progress, money and the
 *  slots they are expected at. */
export default function VendorJobs() {
  const { data, error, loading, reload } = useApi('/api/vendor-portal/jobs')
  const [tab, setTab] = useState('active')
  const [updating, setUpdating] = useState(null)
  const [costing, setCosting] = useState(null)
  const [toast, setToast] = useToast()

  if (loading) return <Spinner label="Loading your jobs" />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  const active = data.jobs.filter((j) => j.phase !== 'Completed')
  const done = data.jobs.filter((j) => j.phase === 'Completed')
  const delayed = active.filter((j) => j.work_status === 'Delayed' || j.work_status === 'Blocked')
  const shown = tab === 'active' ? active : tab === 'delayed' ? delayed : done

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="My jobs"
        title="Weddings you are booked for"
        sub="Tell the manager how each one is going — a delay with a new date is worth ten phone calls. Your cost and profit are private to you."
      />
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'active', label: 'Upcoming & live', count: active.length },
        { id: 'delayed', label: 'Delayed or blocked', count: delayed.length },
        { id: 'done', label: 'Completed', count: done.length },
      ]} />
      {shown.length === 0
        ? <Empty title="Nothing here" hint={tab === 'delayed' ? 'Every job is on track.' : 'No jobs in this list.'} />
        : <div className="space-y-4">
            {shown.map((j) => <JobCard key={j.contract_id} j={j} onUpdate={setUpdating} onCost={setCosting} />)}
          </div>}

      <UpdateModal job={updating} onClose={() => setUpdating(null)}
                   onDone={(res) => { setToast({ message: res.detail }); reload() }} />
      <EditModal open={!!costing} onClose={() => setCosting(null)}
                 title="Your cost for this job" subtitle="Private to you — it is how your profit is worked out"
                 initial={{ vendor_cost: costing?.money.vendor_cost ?? '' }} sendAll
                 fields={[{ name: 'vendor_cost', label: 'Cost to deliver (₹)', type: 'number', required: true, full: true,
                            help: 'Materials, labour, transport, hire — everything it takes.' }]}
                 onSubmit={async (v) => {
                   const res = await api.patch(`/api/vendor-portal/jobs/${costing.contract_id}/cost`, v)
                   setToast({ message: res.detail }); reload()
                 }} />
      {toast}
    </div>
  )
}
