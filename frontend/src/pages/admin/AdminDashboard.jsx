import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Cell,
  Empty,
  Row,
  Table,
  toneForScore,
} from '../../components/ui';
import { useAdminOverview } from './useAdminOverview';

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const TABS = [
  { id: 'trainers', label: 'Trainers' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'admins', label: 'Administrators' },
];

/** Organisation-wide view: every trainer, candidate and administrator. */
export default function AdminDashboard() {
  const { data, error, notice, busyId, run } = useAdminOverview();
  const [tab, setTab] = useState('trainers');

  const setRole = (user, role) =>
    run(
      user.id,
      () => api(`/admin/users/${user.id}/role`, { method: 'PATCH', body: { role } }),
      role === 'trainer'
        ? `${user.fullName} is now a trainer.`
        : `${user.fullName} is a candidate again.`,
    );

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

      <div className="mt-6 space-y-4">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        {tab === 'trainers' && (
          <TrainerTable trainers={trainers} busyId={busyId} onSetRole={setRole} />
        )}
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

function TrainerTable({ trainers, busyId, onSetRole }) {
  if (trainers.length === 0) {
    return (
      <Empty>
        No trainers yet. Allotting a course to someone on the{' '}
        <Link to="/admin/allotment" className="font-medium text-indigo-700 hover:underline">
          allotment page
        </Link>{' '}
        marks them as a trainer.
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <Table
        headers={[
          { label: 'Trainer' },
          { label: 'Leads' },
          { label: 'On the team of' },
          { label: 'Candidates reached', align: 'right' },
          { label: 'Status' },
          { label: '', align: 'right' },
        ]}
      >
        {trainers.map((trainer) => (
          <Row key={trainer.id}>
            <Cell>
              <span className="block font-medium text-slate-900">{trainer.fullName}</span>
              <span className="text-xs text-slate-500">{trainer.email}</span>
            </Cell>
            <Cell>
              {trainer.allotted.length === 0 ? (
                <span className="text-sm text-slate-400">—</span>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {trainer.allotted.map((course) => (
                    <Badge key={course.id} tone={course.isPublished ? 'indigo' : 'amber'}>
                      {course.code}
                    </Badge>
                  ))}
                </span>
              )}
            </Cell>
            <Cell>
              {trainer.assisting.length === 0 ? (
                <span className="text-sm text-slate-400">—</span>
              ) : (
                <span className="flex flex-wrap items-center gap-1.5">
                  {trainer.assisting.map((course) => (
                    <Badge key={course.id} tone="sky">
                      {course.code}
                    </Badge>
                  ))}
                  <span className="text-xs text-slate-500">
                    {plural(trainer.topicDuties, 'topic')} on duty
                  </span>
                </span>
              )}
            </Cell>
            <Cell align="right" className="text-slate-700">
              {trainer.candidatesReached}
            </Cell>
            <Cell>
              <Badge tone={trainer.isActive ? 'green' : 'rose'}>
                {trainer.isActive ? 'Active' : 'Deactivated'}
              </Badge>
            </Cell>
            <Cell align="right">
              <UnmarkButton trainer={trainer} busyId={busyId} onSetRole={onSetRole} />
            </Cell>
          </Row>
        ))}
      </Table>

      <p className="text-xs leading-relaxed text-slate-500">
        A trainer <strong>leads</strong> the courses allotted to them — they publish the material
        and hand each topic to someone. Courses in the third column are ones they work on under
        another lead. Both must be cleared on the{' '}
        <Link to="/admin/allotment" className="font-medium text-indigo-700 hover:underline">
          allotment page
        </Link>{' '}
        before a trainer can be unmarked, so no course is left without a lead.
      </p>
    </div>
  );
}

/**
 * Putting a trainer back to a candidate. Blocked while they still lead a course
 * or sit on a team — the API refuses either way, so the button says why first.
 */
function UnmarkButton({ trainer, busyId, onSetRole }) {
  const blocked =
    trainer.courses > 0
      ? `Allot the ${plural(trainer.courses, 'course')} they lead to someone else first`
      : trainer.assisting.length > 0
        ? `Take them off the team of ${plural(trainer.assisting.length, 'course')} first`
        : null;

  return (
    <Button
      variant="secondary"
      className="whitespace-nowrap px-3 py-1.5"
      disabled={busyId !== null || blocked !== null}
      title={blocked ?? undefined}
      onClick={() => onSetRole(trainer, 'candidate')}
    >
      {busyId === trainer.id ? 'Saving…' : 'Unmark trainer'}
    </Button>
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
          <Row key={admin.id}>
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
          </Row>
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
        <Row key={candidate.id}>
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
        </Row>
      ))}
    </Table>
  );
}
