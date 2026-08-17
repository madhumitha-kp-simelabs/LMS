import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Badge, Card, Empty, toneForScore } from '../../components/ui';

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const TABS = [
  { id: 'trainers', label: 'Trainers' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'admins', label: 'Administrators' },
];

/** Organisation-wide view: every course, trainer and candidate. */
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('trainers');
  const [error, setError] = useState(null);

  useEffect(() => {
    api('/admin/overview')
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Administration</h1>
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { stats, trainers, candidates, admins } = data;

  const counts = {
    trainers: trainers.length,
    candidates: candidates.length,
    admins: admins.length,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Administration</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everyone across the organisation — {stats.trainers} trainer
        {stats.trainers === 1 ? '' : 's'} and {stats.candidates} candidate
        {stats.candidates === 1 ? '' : 's'}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          accent="indigo"
          label="Courses"
          value={stats.courses}
          hint={`${stats.publishedCourses} published · ${stats.topics} topics`}
        />
        <Tile
          accent="violet"
          label="Trainers"
          value={stats.trainers}
          hint={`${admins.length} administrator${admins.length === 1 ? '' : 's'}`}
        />
        <Tile
          accent="sky"
          label="Candidates"
          value={stats.candidates}
          hint={`${stats.attempts} quiz attempt${stats.attempts === 1 ? '' : 's'}`}
        />
        <Tile
          accent={stats.pendingRequests > 0 ? 'amber' : 'emerald'}
          label="Average score"
          value={stats.averageScore === null ? '—' : `${stats.averageScore}%`}
          hint={
            stats.pendingRequests > 0
              ? `${stats.pendingRequests} join request${stats.pendingRequests === 1 ? '' : 's'} waiting`
              : 'No requests waiting'
          }
        />
      </div>

      <div className="mt-8 flex gap-2 border-b border-slate-200">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-5 py-3 text-sm transition ${
                active
                  ? 'border-indigo-500 font-medium text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-px text-xs ${
                  active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {counts[id]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === 'trainers' && <TrainerTable trainers={trainers} />}
        {tab === 'candidates' && <CandidateTable candidates={candidates} />}
        {tab === 'admins' && <AdminTable admins={admins} />}
      </div>
    </div>
  );
}

function Tile({ label, value, hint, accent }) {
  const colour = {
    indigo: 'text-indigo-700',
    violet: 'text-violet-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  }[accent];

  return (
    <Card accent={accent}>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${colour}`}>{value}</p>
      <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
    </Card>
  );
}

function Table({ headers, children }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60">
            {headers.map((h) => (
              <th
                key={h.label}
                className={`px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${
                  h.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

const Cell = ({ children, align = 'left', className = '' }) => (
  <td
    className={`px-5 py-3.5 ${align === 'right' ? 'text-right' : ''} ${className}`}
    style={align === 'right' ? { fontVariantNumeric: 'tabular-nums' } : undefined}
  >
    {children}
  </td>
);

function TrainerTable({ trainers }) {
  if (trainers.length === 0) return <Empty>No trainer accounts yet.</Empty>;

  return (
    <Table
      headers={[
        { label: 'Trainer' },
        { label: 'Courses', align: 'right' },
        { label: 'Candidates reached', align: 'right' },
        { label: 'Joined' },
        { label: 'Status' },
      ]}
    >
      {trainers.map((trainer) => (
        <tr
          key={trainer.id}
          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
        >
          <Cell>
            <span className="block font-medium text-slate-900">{trainer.fullName}</span>
            <span className="text-xs text-slate-500">{trainer.email}</span>
          </Cell>
          <Cell align="right" className="text-slate-700">
            {trainer.courses}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {trainer.candidatesReached}
          </Cell>
          <Cell className="text-slate-500">{formatDate(trainer.createdAt)}</Cell>
          <Cell>
            <Badge tone={trainer.isActive ? 'green' : 'rose'}>
              {trainer.isActive ? 'Active' : 'Deactivated'}
            </Badge>
          </Cell>
        </tr>
      ))}
    </Table>
  );
}

function AdminTable({ admins }) {
  if (admins.length === 0) return <Empty>No administrator accounts yet.</Empty>;

  return (
    <div className="space-y-4">
      <Table
        headers={[{ label: 'Administrator' }, { label: 'Joined' }, { label: 'Status' }]}
      >
        {admins.map((admin) => (
          <tr key={admin.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
            <Cell>
              <span className="block font-medium text-slate-900">{admin.fullName}</span>
              <span className="text-xs text-slate-500">{admin.email}</span>
            </Cell>
            <Cell className="text-slate-500">{formatDate(admin.createdAt)}</Cell>
            <Cell>
              <Badge tone={admin.isActive ? 'green' : 'rose'}>
                {admin.isActive ? 'Active' : 'Deactivated'}
              </Badge>
            </Cell>
          </tr>
        ))}
      </Table>

      <p className="text-xs leading-relaxed text-slate-500">
        Administrators see every course, trainer and candidate, and can create accounts of any
        role. New administrators are created through the API — there is no screen for it yet.
      </p>
    </div>
  );
}

function CandidateTable({ candidates }) {
  if (candidates.length === 0) return <Empty>No candidate accounts yet.</Empty>;

  return (
    <Table
      headers={[
        { label: 'Candidate' },
        { label: 'Courses', align: 'right' },
        { label: 'Topics', align: 'right' },
        { label: 'Quizzes done', align: 'right' },
        { label: 'Average', align: 'right' },
        { label: 'Last active' },
      ]}
    >
      {candidates.map((candidate) => (
        <tr
          key={candidate.id}
          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
        >
          <Cell>
            <span className="block font-medium text-slate-900">{candidate.fullName}</span>
            <span className="text-xs text-slate-500">{candidate.email}</span>
          </Cell>
          <Cell align="right" className="text-slate-700">
            {candidate.courses}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {candidate.topicsAllotted}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {candidate.quizzesDone}
            {candidate.attempts > candidate.quizzesDone && (
              <span className="ml-1 text-xs text-slate-400">({candidate.attempts} tries)</span>
            )}
          </Cell>
          <Cell align="right">
            {candidate.averageScore === null ? (
              <span className="text-slate-400">—</span>
            ) : (
              <Badge tone={toneForScore(candidate.averageScore)}>{candidate.averageScore}%</Badge>
            )}
          </Cell>
          <Cell className="text-slate-500">{formatDate(candidate.lastActive)}</Cell>
        </tr>
      ))}
    </Table>
  );
}
