import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Alert,
  Badge,
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
  { id: 'leads', label: 'Leads' },
  { id: 'trainers', label: 'Trainers' },
  { id: 'candidates', label: 'Candidates' },
  { id: 'admins', label: 'Administrators' },
];

/** Organisation-wide view: every lead, trainer, candidate and administrator. */
export default function AdminDashboard() {
  const { data, error, notice, busyId, run } = useAdminOverview();
  const [tab, setTab] = useState('leads');

  const setRole = (user, role) =>
    run(
      user.id,
      () => api(`/admin/users/${user.id}/role`, { method: 'PATCH', body: { role } }),
      {
        lead: `${user.fullName} is now a course lead.`,
        trainer: `${user.fullName} is now a trainer.`,
        candidate: `${user.fullName} is a candidate again.`,
      }[role],
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

  const { stats, courses, leads, trainers, candidates, admins } = data;

  const counts = {
    leads: leads.length,
    trainers: trainers.length,
    candidates: candidates.length,
    admins: admins.length,
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Administration</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everyone across the organisation — {plural(leads.length, 'lead')} running{' '}
        {plural(stats.courses, 'course')}, {plural(stats.trainers, 'trainer')} in all, and{' '}
        {plural(stats.candidates, 'candidate')}.
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
          hint={`${plural(leads.length, 'lead')} · ${plural(admins.length, 'administrator')}`}
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

        {tab === 'leads' && (
          <LeadTable leads={leads} courses={courses} busyId={busyId} onSetRole={setRole} />
        )}
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

const allotmentLink = (
  <Link to="/admin/allotment" className="font-medium text-indigo-700 hover:underline">
    allotment page
  </Link>
);

/**
 * Lead accounts. A lead runs courses and is the only one who can publish; the
 * tab answers, for each of them, what they run and who works under them.
 */
function LeadTable({ leads, courses, busyId, onSetRole }) {
  if (leads.length === 0) {
    return (
      <Empty>
        No lead accounts yet. Allot a course to someone on the {allotmentLink} and they become a
        lead.
      </Empty>
    );
  }

  const teamOf = (lead) => {
    // Everyone working under this lead, across all their courses, each counted
    // once even if they help on two of them.
    const seen = new Map();
    for (const course of courses) {
      if (course.trainer?.id !== lead.id) continue;
      for (const member of course.team) seen.set(member.id, member);
    }
    return [...seen.values()];
  };

  return (
    <div className="space-y-4">
      <Table
        headers={[
          { label: 'Lead' },
          { label: 'Courses they run' },
          { label: 'Trainers under them' },
          { label: 'Candidates', align: 'right' },
          { label: 'Status' },
          { label: 'Role', align: 'right' },
        ]}
      >
        {leads.map((lead) => {
          const team = teamOf(lead);

          return (
            <Row key={lead.id}>
              <Cell>
                <span className="block font-medium text-slate-900">{lead.fullName}</span>
                <span className="text-xs text-slate-500">{lead.email}</span>
              </Cell>

              <Cell>
                {lead.allotted.length === 0 ? (
                  <span className="text-sm text-amber-700">No course yet</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {lead.allotted.map((course) => (
                      <Badge key={course.id} tone={course.isPublished ? 'indigo' : 'amber'}>
                        {course.code}
                      </Badge>
                    ))}
                  </span>
                )}
              </Cell>

              <Cell>
                {team.length === 0 ? (
                  <span className="text-sm text-amber-700">No trainers yet</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {team.map((member) => (
                      <span key={member.id} className="text-sm text-slate-700">
                        {member.fullName}
                      </span>
                    ))}
                    <span className="text-xs text-slate-500">({team.length})</span>
                  </span>
                )}
              </Cell>

              <Cell align="right" className="text-slate-700">
                {lead.candidatesReached}
              </Cell>

              <Cell>
                <Badge tone={lead.isActive ? 'green' : 'rose'}>
                  {lead.isActive ? 'Active' : 'Deactivated'}
                </Badge>
              </Cell>

              <Cell align="right">
                <RoleSelect person={lead} busyId={busyId} onSetRole={onSetRole} />
              </Cell>
            </Row>
          );
        })}
      </Table>

      <p className="text-xs leading-relaxed text-slate-500">
        A <strong>lead</strong> runs a course: they publish its material and quizzes, and hand each
        topic to one of the trainers under them. Add or change either on the {allotmentLink}. An
        amber course code means the course is still a draft.
      </p>
    </div>
  );
}

/**
 * Every trainer account, and the courses each one touches — whether they run it
 * or work on it. One column, because "which courses is this person on?" is a
 * single question.
 */
function TrainerTable({ trainers, busyId, onSetRole }) {
  if (trainers.length === 0) {
    return (
      <Empty>
        No trainers yet. Allotting a course to someone on the {allotmentLink}, or adding them to a
        course team, marks them as a trainer.
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <Table
        headers={[
          { label: 'Lead' },
          { label: 'Courses' },
          { label: 'Topics to write', align: 'right' },
          { label: 'Status' },
          { label: '', align: 'right' },
        ]}
      >
        {trainers.map((trainer) => {
          const courses = [
            ...trainer.allotted.map((c) => ({ ...c, runs: true })),
            ...trainer.assisting.map((c) => ({ ...c, runs: false })),
          ];

          return (
            <Row key={trainer.id}>
              <Cell>
                <span className="block font-medium text-slate-900">{trainer.fullName}</span>
                <span className="text-xs text-slate-500">{trainer.email}</span>
              </Cell>

              <Cell>
                {courses.length === 0 ? (
                  <span className="text-sm text-slate-400">On no course</span>
                ) : (
                  <span className="flex flex-wrap gap-1.5">
                    {courses.map((course) => (
                      <span
                        key={course.id}
                        title={course.title}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                          course.runs
                            ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                            : 'bg-sky-50 text-sky-700 ring-sky-200'
                        }`}
                      >
                        {course.code}
                        <span className="font-normal opacity-70">
                          {course.runs ? 'runs it' : 'works on it'}
                        </span>
                      </span>
                    ))}
                  </span>
                )}
              </Cell>

              <Cell align="right" className="text-slate-700">
                {trainer.assisting.length === 0 ? (
                  <span className="text-slate-400">—</span>
                ) : trainer.topicDuties === 0 ? (
                  <span className="text-amber-700">none yet</span>
                ) : (
                  trainer.topicDuties
                )}
              </Cell>

              <Cell>
                <Badge tone={trainer.isActive ? 'green' : 'rose'}>
                  {trainer.isActive ? 'Active' : 'Deactivated'}
                </Badge>
              </Cell>

              <Cell align="right">
                <RoleSelect person={trainer} busyId={busyId} onSetRole={onSetRole} />
              </Cell>
            </Row>
          );
        })}
      </Table>

      <p className="text-xs leading-relaxed text-slate-500">
        <strong>Runs it</strong> means they are the course’s lead — they publish it and hand out its
        topics. <strong>Works on it</strong> means they are on someone else’s team, writing the
        topics they are given. “Topics to write” counts the topics handed to them so far. A trainer
        on any course must be taken off it on the {allotmentLink} before they can be unmarked.
      </p>
    </div>
  );
}

/**
 * Putting a trainer back to a candidate. Blocked while they still lead a course
 * or sit on a team — the API refuses either way, so the button says why first.
 */
function RoleSelect({ person, busyId, onSetRole }) {
  // Leaving a role means leaving the work that came with it. The API refuses
  // either way; saying so here beats letting them pick and then fail.
  const blocked =
    person.courses > 0
      ? `Allot the ${plural(person.courses, 'course')} they lead to someone else first`
      : person.assisting.length > 0
        ? `Take them off the team of ${plural(person.assisting.length, 'course')} first`
        : null;

  if (blocked) {
    return (
      <span className="cursor-help text-xs text-slate-400" title={blocked}>
        In use
      </span>
    );
  }

  return (
    <select
      value={person.role}
      disabled={busyId !== null}
      onChange={(event) => onSetRole(person, event.target.value)}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
    >
      <option value="lead">Lead</option>
      <option value="trainer">Trainer</option>
      <option value="candidate">Candidate</option>
    </select>
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

/**
 * Just enough to find someone: their name, what they are on and who teaches it,
 * and whether they have been active. Every figure lives on their own page —
 * a wall of zeroes told you nothing about thirteen people.
 */
function CandidateTable({ candidates }) {
  if (candidates.length === 0) return <Empty>No candidate accounts yet.</Empty>;

  return (
    <Table
      headers={[{ label: 'Candidate' }, { label: 'Courses' }, { label: 'Last active' }]}
    >
      {candidates.map((candidate) => (
        <Row key={candidate.id}>
          <Cell>
            <Link to={`/admin/candidates/${candidate.id}`} className="group">
              <span className="block font-medium text-slate-900 group-hover:text-indigo-700">
                {candidate.fullName}
              </span>
              <span className="text-xs text-slate-500">{candidate.email}</span>
            </Link>
          </Cell>

          <Cell>
            {candidate.enrolled.length === 0 ? (
              <span className="text-sm text-slate-400">Not on any course</span>
            ) : (
              <div className="space-y-1">
                {candidate.enrolled.map((course) => (
                  <div key={course.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-semibold tracking-wide text-indigo-600">
                      {course.code}
                    </span>
                    <span className="text-sm text-slate-800">{course.title}</span>
                    <span className="text-xs text-slate-500">
                      · {course.trainer ? course.trainer.fullName : 'no lead yet'}
                    </span>
                    {course.status === 'pending' && <Badge tone="amber">Awaiting approval</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Cell>

          <Cell className="whitespace-nowrap text-slate-500">
            {formatDate(candidate.lastActive)}
          </Cell>
        </Row>
      ))}
    </Table>
  );
}
