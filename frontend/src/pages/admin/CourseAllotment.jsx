import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Avatar, Badge, Button, Card, Empty, Select } from '../../components/ui';
import { useAdminOverview } from './useAdminOverview';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Who runs what.
 *
 * The form at the top is for the first allotment; every course below is a card
 * you can open and change, so adjusting a lead or a team never means scrolling
 * back up to re-pick a course you are already looking at.
 *
 * Naming someone from the candidate list marks them a trainer as part of the
 * same action, which is why there is no separate "make trainer" step here.
 */
export default function CourseAllotment() {
  const { data, error, notice, busyId, run } = useAdminOverview();

  if (error) {
    return (
      <div>
        <Heading />
        <div className="mt-4">
          <Alert>{error}</Alert>
        </div>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { courses, leads, trainers, candidates } = data;

  // Leads run courses, trainers work on them, and a candidate can become
  // either by being picked. Deactivated accounts are left out — the API
  // refuses them, so offering them would only produce an error.
  const activeLeads = leads.filter((l) => l.isActive);
  const activeTrainers = trainers.filter((t) => t.isActive);
  const activeCandidates = candidates.filter((c) => c.isActive);
  const people = [...activeLeads, ...activeTrainers, ...activeCandidates];

  const allot = (courseId, userId) => {
    const course = courses.find((c) => c.id === courseId);
    const person = people.find((p) => p.id === userId);
    const promoted = activeCandidates.some((c) => c.id === userId);

    return run(
      `allot-${courseId}`,
      () => api('/admin/allotments', { method: 'POST', body: { courseId, userId } }),
      promoted
        ? `${person.fullName} is now a course lead, running ${course.code}.`
        : `${course.code} is now led by ${person.fullName}.`,
    );
  };

  const addToTeam = (course, person) =>
    run(
      `team-${course.id}`,
      () => api(`/admin/courses/${course.id}/team`, { method: 'POST', body: { userId: person.id } }),
      `${person.fullName} is on the ${course.code} team.`,
    );

  const removeFromTeam = (course, person) =>
    run(
      `team-${course.id}`,
      () => api(`/admin/courses/${course.id}/team/${person.id}`, { method: 'DELETE' }),
      `${person.fullName} is off the ${course.code} team.`,
    );

  const waiting = courses.filter((c) => !c.trainer);
  // Distinct people actually running something — one person leading three
  // courses is one lead.
  const leadCount = new Set(courses.filter((c) => c.trainer).map((c) => c.trainer.id)).size;

  return (
    <div>
      <Heading />

      <div className="mt-8 space-y-8">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        <AllotmentForm
          courses={courses}
          leads={activeLeads}
          candidates={activeCandidates}
          busyId={busyId}
          onAllot={allot}
        />

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 className="text-lg font-semibold text-slate-900">Courses</h2>
            <p className="text-sm text-slate-500">
              {plural(courses.length, 'course')} · {plural(leadCount, 'lead')}
              {waiting.length > 0 && (
                <span className="font-medium text-amber-700"> · {waiting.length} without a lead</span>
              )}
            </p>
          </div>

          {courses.length === 0 ? (
            <div className="mt-4">
              <Empty>
                No courses yet. Add one on the{' '}
                <Link to="/admin/courses" className="font-medium text-indigo-700 hover:underline">
                  courses page
                </Link>
                .
              </Empty>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  leads={activeLeads}
                  trainers={activeTrainers}
                  candidates={activeCandidates}
                  busyId={busyId}
                  onAllot={allot}
                  onAdd={addToTeam}
                  onRemove={removeFromTeam}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const Heading = () => (
  <div>
    <h1 className="text-2xl font-semibold text-slate-900">Course allotment</h1>
    <p className="mt-1 text-sm text-slate-500">
      Decide who leads each course and who works on it. The lead owns the course’s topics, material
      and quizzes, publishes them, and hands each topic to someone on the team.
    </p>
  </div>
);

// ------------------------------------------------------------------- form

/** Course + person, in that order: you pick the work, then who does it. */
function AllotmentForm({ courses, leads, candidates, busyId, onAllot }) {
  const [courseId, setCourseId] = useState('');
  const [userId, setUserId] = useState('');

  const course = courses.find((c) => c.id === courseId);
  const promoting = candidates.some((c) => c.id === userId);

  if (courses.length === 0) return null;

  // Courses with nobody on them come first: they are what this form is for.
  const waiting = courses.filter((c) => !c.trainer);
  const running = courses.filter((c) => c.trainer);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!courseId || !userId) return;

    const done = await onAllot(courseId, userId);
    if (done) {
      setCourseId('');
      setUserId('');
    }
  }

  return (
    <Card accent="indigo">
      <h2 className="text-lg font-semibold text-slate-900">Allot a course</h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <Select
            label="Course"
            required
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
          >
            <option value="" disabled>
              Choose a course…
            </option>
            {waiting.length > 0 && (
              <optgroup label="Without a lead">
                {waiting.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </optgroup>
            )}
            {running.length > 0 && (
              <optgroup label="Already allotted">
                {running.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>

          <PersonSelect
            label="Lead"
            required
            staff={leads}
            staffLabel="Leads"
            candidates={candidates}
            becomes="leads"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="Choose who will lead it…"
          />

          <Button type="submit" disabled={busyId !== null || !courseId || !userId}>
            {busyId === `allot-${courseId}` ? 'Allotting…' : 'Allot course'}
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          {!course && 'Pick a course to see who leads it today. '}
          {course?.trainer && (
            <>
              {course.code} is led by <strong>{course.trainer.fullName}</strong>. Allotting it moves
              the course and everything in it; candidates already enrolled stay enrolled.{' '}
            </>
          )}
          {course && !course.trainer && <>{course.code} has no lead yet. </>}
          {promoting && 'The person you have chosen is a candidate, and will be marked as a trainer.'}
        </p>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ cards

/**
 * One course, read-only until you press Edit. Keeping the controls behind that
 * press is what makes a list of courses scannable — a page of open dropdowns
 * reads as a form, not as a summary of who runs what.
 */
function CourseCard({ course, leads, trainers, candidates, busyId, onAllot, onAdd, onRemove }) {
  const [editing, setEditing] = useState(false);
  const busy = busyId === `team-${course.id}` || busyId === `allot-${course.id}`;

  return (
    <Card accent={course.trainer ? 'indigo' : 'amber'} className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-indigo-700">
              {course.code}
            </span>
            <Badge tone={course.isPublished ? 'green' : 'amber'}>
              {course.isPublished ? 'Published' : 'Draft'}
            </Badge>
            {!course.trainer && <Badge tone="rose">Needs a lead</Badge>}
          </div>

          <h3 className="mt-1.5 font-semibold text-slate-900">{course.title}</h3>

          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
            <span>{plural(course.topics, 'topic')}</span>
            {course.unassignedTopics > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">{course.unassignedTopics} not handed out</span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <span>{plural(course.candidates, 'candidate')}</span>
            {course.pendingRequests > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-amber-700">{course.pendingRequests} waiting to join</span>
              </>
            )}
          </p>
        </div>

        <Button
          variant={editing ? 'primary' : 'secondary'}
          size="sm"
          className="shrink-0"
          onClick={() => setEditing((open) => !open)}
        >
          {editing ? 'Done' : 'Edit'}
        </Button>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        {editing ? (
          <CourseEditor
            course={course}
            leads={leads}
            trainers={trainers}
            candidates={candidates}
            busy={busy}
            onAllot={onAllot}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ) : (
          <CourseSummary course={course} />
        )}
      </div>
    </Card>
  );
}

/** Who is on the course, at a glance. */
function CourseSummary({ course }) {
  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lead</p>
        <div className="mt-1.5">
          {course.trainer ? (
            <span className="flex items-center gap-2">
              <Avatar name={course.trainer.fullName} tone="indigo" />
              <span className="text-sm font-medium text-slate-900">{course.trainer.fullName}</span>
            </span>
          ) : (
            <span className="text-sm text-amber-700">Nobody yet</span>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Team ({course.team.length})
        </p>
        <div className="mt-1.5">
          {course.team.length === 0 ? (
            <span className="text-sm text-slate-400">No trainers added</span>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {course.team.map((member) => (
                <span key={member.id} className="flex items-center gap-2">
                  <Avatar
                    name={member.fullName}
                    tone={member.isActive ? 'sky' : 'amber'}
                    size="sm"
                  />
                  <span className="text-sm text-slate-700">{member.fullName}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The same two facts, as controls. */
function CourseEditor({ course, leads, trainers, candidates, busy, onAllot, onAdd, onRemove }) {
  const onTeam = new Set(course.team.map((m) => m.id));

  // The lead cannot also sit on their own team, and nobody appears twice.
  const spare = (people) => people.filter((p) => !onTeam.has(p.id) && p.id !== course.trainer?.id);
  const spareTrainers = spare(trainers);
  const spareCandidates = spare(candidates);
  const nobodyLeft = spareTrainers.length + spareCandidates.length === 0;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <PersonSelect
          label="Lead"
          staff={leads.filter((l) => l.id !== course.trainer?.id)}
          staffLabel="Leads"
          becomes="leads"
          candidates={candidates}
          value=""
          disabled={busy}
          onChange={(event) => onAllot(course.id, event.target.value)}
          placeholder={course.trainer ? `${course.trainer.fullName} — change to…` : 'Choose a lead…'}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          Moves the course and everything in it. Enrolled candidates stay enrolled.
        </p>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium text-slate-700">Team</p>

        {course.team.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {course.team.map((member) => (
              <span
                key={member.id}
                className={`inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium ring-1 ${
                  member.isActive
                    ? 'bg-white text-slate-700 ring-slate-300'
                    : 'bg-rose-50 text-rose-700 ring-rose-200'
                }`}
              >
                {member.fullName}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(course, member)}
                  title={`Take ${member.fullName} off this team`}
                  className="grid h-4 w-4 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {!course.trainer ? (
          <p className="text-xs text-slate-500">Give the course a lead first.</p>
        ) : nobodyLeft ? (
          <p className="text-xs text-slate-500">Everyone is already on this course.</p>
        ) : (
          <PersonSelect
            staff={spareTrainers}
            staffLabel="Trainers"
            becomes="trainers"
            candidates={spareCandidates}
            value=""
            disabled={busy}
            onChange={(event) => {
              const person = [...spareTrainers, ...spareCandidates].find(
                (p) => p.id === event.target.value,
              );
              if (person) onAdd(course, person);
            }}
            placeholder={busy ? 'Saving…' : '+ Add a trainer'}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The people a slot can be filled from, in two groups: those who already hold
 * the role, and candidates who would be given it by the act of choosing them.
 *
 * Leads and trainers are separate account types, so a lead never appears in the
 * team picker and a trainer never in the lead picker — the API refuses both, and
 * offering them would only produce an error.
 */
function PersonSelect({
  label,
  staff,
  staffLabel,
  candidates,
  becomes,
  value,
  onChange,
  placeholder,
  disabled,
  required,
}) {
  return (
    <Select label={label} value={value} required={required} disabled={disabled} onChange={onChange}>
      <option value="" disabled>
        {placeholder}
      </option>
      {staff.length > 0 && (
        <optgroup label={staffLabel}>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
              {person.courses > 0 ? ` — ${plural(person.courses, 'course')}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      {candidates.length > 0 && (
        <optgroup label={`Candidates — will be made ${becomes}`}>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}
