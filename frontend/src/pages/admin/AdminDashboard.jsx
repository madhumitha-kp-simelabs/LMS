import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Cell,
  Empty,
  Input,
  Row,
  Select,
  Table,
} from '../../components/ui';
import { useAdminOverview } from './useAdminOverview';
import TeamManager from './TeamManager';

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
  const { data, error, notice, busyId, run, reload } = useAdminOverview();
  const [tab, setTab] = useState('leads');
  const [teams, setTeams] = useState([]);

  const loadTeams = useCallback(
    () =>
      api('/teams')
        .then(({ teams }) => setTeams(teams))
        // A missing team list is not worth blocking the whole page for; the
        // Candidates tab simply shows everyone ungrouped.
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  /**
   * A team write changes two lists — the counts on /teams and the people on
   * /admin/overview. `run` refreshes the second; this wraps it to refresh the
   * first, so a rename never leaves stale counts beside fresh names.
   */
  const runTeam = async (id, request, done) => {
    const ok = await run(id, request, done);
    await loadTeams();
    return ok;
  };

  const addTeam = (name) =>
    runTeam('teams', () => api('/teams', { method: 'POST', body: { name } }), `"${name}" added.`);

  const renameTeam = (team, name) =>
    runTeam(
      'teams',
      () => api(`/teams/${team.id}`, { method: 'PATCH', body: { name } }),
      `"${team.name}" is now "${name}".`,
    );

  const removeTeam = (team) =>
    runTeam(
      'teams',
      () => api(`/teams/${team.id}`, { method: 'DELETE' }),
      `"${team.name}" removed.${team.members > 0 ? ` ${team.members} candidate${team.members === 1 ? '' : 's'} unassigned.` : ''}`,
    );

  /** Empty teamId means "take them off", which is a delete rather than a move. */
  const setTeam = (candidate, teamId) =>
    runTeam(
      candidate.id,
      () =>
        teamId
          ? api(`/teams/${teamId}/members`, { method: 'POST', body: { userIds: [candidate.id] } })
          : api(`/teams/${candidate.team.id}/members/${candidate.id}`, { method: 'DELETE' }),
      teamId
        ? `${candidate.fullName} moved to ${teams.find((t) => t.id === teamId)?.name ?? 'a team'}.`
        : `${candidate.fullName} taken off their team.`,
    );

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

      {/* One strip rather than four floating cards, and none of these repeat a
          number the tabs below already carry. The old set had Trainers and
          Candidates tiles sitting directly above tabs reading "Trainers 9" and
          "Candidates 6", which is the same fact twice in two different shapes. */}
      <Card flush className="mt-8 overflow-hidden">
        <div className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          <Tile
            accent="indigo"
            label="Courses"
            value={stats.courses}
            hint={`${stats.publishedCourses} published · ${stats.courses - stats.publishedCourses} draft`}
          />
          <Tile
            accent="violet"
            label="Topics"
            value={stats.topics}
            hint={
              stats.courses === 0
                ? 'no courses yet'
                : `across ${plural(stats.courses, 'course')}`
            }
          />
          <Tile
            accent="sky"
            label="Quiz attempts"
            value={stats.attempts}
            // Average score belongs to the attempts that produced it, not
            // stranded in a tile of its own with somebody else's footnote.
            hint={
              stats.averageScore === null
                ? 'nothing scored yet'
                : `averaging ${stats.averageScore}%`
            }
          />
          <Tile
            accent={stats.pendingRequests > 0 ? 'amber' : 'emerald'}
            label="Join requests"
            value={stats.pendingRequests}
            hint={stats.pendingRequests > 0 ? 'waiting on a lead' : 'nothing waiting'}
            to={stats.pendingRequests > 0 ? '/trainer/inbox' : undefined}
          />
        </div>
      </Card>

      {/* The one thing on this page that is a job rather than a number. */}
      {stats.unallottedCourses > 0 && (
        <div className="mt-4">
          <Alert tone="amber">
            {plural(stats.unallottedCourses, 'course')} still without a lead —{' '}
            <Link to="/admin/allotment" className="font-medium underline">
              hand them out
            </Link>
            .
          </Alert>
        </div>
      )}

      {/* The same segmented control the course pages use. An underline row
          between a stat strip and a table reads as a caption of one or a header
          of the other; a solid control reads as neither, which is what it is. */}
      <div className="mt-8 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
                active
                  ? 'bg-indigo-600 font-semibold text-white shadow-sm'
                  : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
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
        {tab === 'candidates' && (
          <CandidateTable
            candidates={candidates}
            courses={courses}
            teams={teams}
            busyId={busyId}
            onSetTeam={setTeam}
            onAddTeam={addTeam}
            onRenameTeam={renameTeam}
            onRemoveTeam={removeTeam}
          />
        )}
        {tab === 'admins' && <AdminTable admins={admins} />}
      </div>
    </div>
  );
}

/**
 * One number and what it means. `to` makes the whole tile a link, used only
 * where the number is something to act on — a count of join requests is a queue,
 * a count of topics is just a fact.
 */
function Tile({ label, value, hint, accent, to }) {
  const colour = {
    indigo: 'text-indigo-700',
    violet: 'text-violet-700',
    sky: 'text-sky-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  }[accent];

  const rule = {
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
    sky: 'bg-sky-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
  }[accent];

  const body = (
    <>
      <span className="flex items-center gap-2">
        {/* A short coloured rule instead of the card's full-width top edge:
            inside a shared strip, four separate top borders read as four cards
            that failed to line up. */}
        <span className={`h-3 w-1 shrink-0 rounded-full ${rule}`} aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
      </span>
      <span className={`mt-2 block text-3xl font-semibold tabular-nums ${colour}`}>{value}</span>
      <span className="mt-1 block text-xs text-slate-500">{hint}</span>
    </>
  );

  const className = 'block px-5 py-4';

  return to ? (
    <Link to={to} className={`${className} transition hover:bg-slate-50`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
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
/**
 * What a candidate's standing is, as one word, for the status filter.
 *
 * Derived rather than stored: "waiting" is a property of their enrolments, and
 * a candidate with one approved course and one request pending is waiting on
 * somebody — which is the case the filter exists to find.
 */
const standingOf = (candidate) => {
  if (!candidate.isActive) return 'inactive';
  if (candidate.enrolled.some((course) => course.status === 'pending')) return 'waiting';
  return candidate.enrolled.length === 0 ? 'unplaced' : 'placed';
};

const STANDINGS = {
  placed: 'On a course',
  unplaced: 'Not on any course',
  waiting: 'Awaiting approval',
  inactive: 'Deactivated',
};

/**
 * Candidates by team, in the teams' display order, unfiled last.
 *
 * Empty teams are dropped — a heading with nobody under it is a promise the
 * list does not keep, and the Teams card above already shows every team and its
 * count, including the empty ones.
 */
function groupByTeam(candidates, teams) {
  const groups = teams
    .map((team) => ({ team, candidates: candidates.filter((c) => c.team?.id === team.id) }))
    .filter((group) => group.candidates.length > 0);

  const unfiled = candidates.filter((c) => !c.team);
  return unfiled.length > 0 ? [...groups, { team: null, candidates: unfiled }] : groups;
}

function CandidateTable({
  candidates,
  courses,
  teams,
  busyId,
  onSetTeam,
  onAddTeam,
  onRenameTeam,
  onRemoveTeam,
}) {
  const [query, setQuery] = useState('');
  const [courseId, setCourseId] = useState('');
  const [standing, setStanding] = useState('');
  const [teamId, setTeamId] = useState('');

  const filtered = useMemo(() => {
    // Matched against name and email together, so half a name and half an
    // address both work and nobody has to know which field they are in.
    const needle = query.trim().toLowerCase();

    return candidates.filter((candidate) => {
      if (
        needle &&
        !`${candidate.fullName} ${candidate.email}`.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (courseId && !candidate.enrolled.some((course) => course.id === courseId)) return false;
      if (standing && standingOf(candidate) !== standing) return false;
      // 'none' is a real choice: finding who has not been filed yet is most of
      // what an administrator does with this.
      if (teamId === 'none' && candidate.team) return false;
      if (teamId && teamId !== 'none' && candidate.team?.id !== teamId) return false;
      return true;
    });
  }, [candidates, query, courseId, standing, teamId]);

  if (candidates.length === 0) return <Empty>No candidate accounts yet.</Empty>;

  const filtering = Boolean(query.trim() || courseId || standing || teamId);

  const clear = () => {
    setQuery('');
    setCourseId('');
    setStanding('');
    setTeamId('');
  };

  return (
    <div className="space-y-4">
      <TeamManager
        teams={teams}
        busy={busyId === 'teams'}
        onAdd={onAddTeam}
        onRename={onRenameTeam}
        onRemove={onRemoveTeam}
      />

      {/* Unlabelled boxes: three labels stacked above three controls doubles the
          height of the bar to repeat what the placeholder already says. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[16rem] flex-1">
          <Input
            type="search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="w-56">
          <Select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">Any course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} — {course.title}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-48">
          <Select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">Any team</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.members})
              </option>
            ))}
            <option value="none">Not on a team</option>
          </Select>
        </div>

        <div className="w-48">
          <Select value={standing} onChange={(event) => setStanding(event.target.value)}>
            <option value="">Any standing</option>
            {Object.entries(STANDINGS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {/* Only offered once there is something to clear, so the bar does not
            carry a dead button the whole time. */}
        {filtering && (
          <Button variant="secondary" size="sm" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      {filtering && (
        <p className="text-xs text-slate-500">
          {filtered.length === 0
            ? 'No candidates match.'
            : `Showing ${filtered.length} of ${plural(candidates.length, 'candidate')}.`}
        </p>
      )}

      {filtered.length === 0 ? (
        <Empty>
          Nobody matches those filters. <button onClick={clear} className="underline">Clear them</button> to see all{' '}
          {plural(candidates.length, 'candidate')}.
        </Empty>
      ) : (
        // Grouped by team, in the teams' own display order, with the unfiled
        // last — they are the ones needing a decision, and a heading nobody can
        // miss is the point of putting them at the end rather than the top.
        <div className="space-y-6">
          {/* Labelled once. A table per group meant a header row per group, and
              — worse — each table sized its own columns, so MERN's Courses
              column landed eighty pixels off Python's. One grid, shared by the
              labels and every row, is what keeps them in line. */}
          <div
            className={`${PEOPLE_GRID} px-5 text-[11px] font-semibold uppercase tracking-wide text-slate-400`}
          >
            <span>Candidate</span>
            <span>Courses</span>
            <span>Team</span>
            <span className="text-right">Last active</span>
          </div>

          {groupByTeam(filtered, teams).map((group) => (
            <section key={group.team?.id ?? 'none'}>
              <div className="flex items-center gap-3">
                <span
                  className={`h-4 w-1 shrink-0 rounded-full ${
                    group.team ? 'bg-violet-400' : 'bg-slate-300'
                  }`}
                  aria-hidden
                />
                <h3 className="text-sm font-semibold text-slate-900">
                  {group.team?.name ?? 'Not on a team'}
                </h3>
                <span className="text-xs text-slate-500">
                  {plural(group.candidates.length, 'candidate')}
                </span>
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
              </div>

              <Card flush className="mt-2.5 overflow-hidden">
                <ul className="divide-y divide-slate-100">
                  {group.candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <CandidateRow
                        candidate={candidate}
                        teams={teams}
                        busy={busyId === candidate.id}
                        onSetTeam={onSetTeam}
                      />
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One grid, shared by the column labels and every candidate row, so the columns
 * line up down the whole page even though the rows live in separate cards.
 */
const PEOPLE_GRID =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_180px_100px] items-center gap-x-4';

function CandidateRow({ candidate, teams, busy, onSetTeam }) {
  return (
    <div className={`${PEOPLE_GRID} px-5 py-3 transition hover:bg-slate-50/70`}>
      <Link to={`/admin/candidates/${candidate.id}`} className="group min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-slate-900 group-hover:text-indigo-700">
            {candidate.fullName}
          </span>
          {/* Filterable, so it has to be visible — otherwise picking
              "Deactivated" returns rows with nothing to show for it. */}
          {!candidate.isActive && <Badge tone="rose">Deactivated</Badge>}
        </span>
        <span className="block truncate text-xs text-slate-500">{candidate.email}</span>
      </Link>

      <div className="min-w-0 text-sm">
        {candidate.enrolled.length === 0 ? (
          <span className="text-slate-400">Not on any course</span>
        ) : (
          candidate.enrolled.map((course) => (
            <div key={course.id} className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-xs font-semibold tracking-wide text-indigo-600">
                {course.code}
              </span>
              <span className="truncate text-slate-800">{course.title}</span>
              {course.status === 'pending' && <Badge tone="amber">Awaiting approval</Badge>}
            </div>
          ))
        )}
      </div>

      {/* Changed in place rather than behind an Edit press: filing people is
          the one thing this screen is for, and a dropdown is already as small
          as the control can be. */}
      <Select
        value={candidate.team?.id ?? ''}
        disabled={busy}
        onChange={(event) => onSetTeam(candidate, event.target.value)}
      >
        <option value="">— none —</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </Select>

      <span className="text-right text-xs text-slate-500">
        {formatDate(candidate.lastActive)}
      </span>
    </div>
  );
}
