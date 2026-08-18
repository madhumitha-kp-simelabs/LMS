import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Button, Card, Cell, Empty, Row, Select, Table } from '../../components/ui';
import { useAdminOverview } from './useAdminOverview';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Who runs what. One form allots a course to a person; naming someone from the
 * candidate list marks them a trainer as part of the same action, which is why
 * there is no separate "make trainer" step on this screen.
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

  const { courses, trainers, candidates } = data;

  // Anyone a course can be handed to. Deactivated accounts are left out —
  // the API refuses them, so offering them would only produce an error.
  const activeTrainers = trainers.filter((t) => t.isActive);
  const activeCandidates = candidates.filter((c) => c.isActive);
  const people = [...activeTrainers, ...activeCandidates];

  const allot = (courseId, userId) => {
    const course = courses.find((c) => c.id === courseId);
    const person = people.find((p) => p.id === userId);
    const promoted = activeCandidates.some((c) => c.id === userId);

    return run(
      'allot',
      () => api('/admin/allotments', { method: 'POST', body: { courseId, userId } }),
      promoted
        ? `${person.fullName} is now a trainer, running ${course.code}.`
        : `${course.code} is now run by ${person.fullName}.`,
    );
  };

  const waiting = courses.filter((c) => !c.trainer);

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

  return (
    <div>
      <Heading />

      <div className="mt-8 space-y-8">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        <AllotmentForm
          courses={courses}
          trainers={activeTrainers}
          candidates={activeCandidates}
          busy={busyId === 'allot'}
          onAllot={allot}
        />

        <section>
          <h2 className="text-lg font-semibold text-slate-900">Course teams</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {plural(courses.length, 'course')} across {plural(activeTrainers.length, 'lead')}
            {waiting.length > 0 && `, ${waiting.length} still waiting for one`}. The lead divides
            their course’s topics among the team.
          </p>

          <div className="mt-4">
            <AllotmentTable
              courses={courses}
              trainers={activeTrainers}
              candidates={activeCandidates}
              busyId={busyId}
              onAdd={addToTeam}
              onRemove={removeFromTeam}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

const Heading = () => (
  <div>
    <h1 className="text-2xl font-semibold text-slate-900">Course allotment</h1>
    <p className="mt-1 text-sm text-slate-500">
      Decide who runs each course. The trainer you allot it to owns its topics, material and
      quizzes, approves join requests, and allots topics to candidates.
    </p>
  </div>
);

/** Course + person, in that order: you pick the work, then who does it. */
function AllotmentForm({ courses, trainers, candidates, busy, onAllot }) {
  const [courseId, setCourseId] = useState('');
  const [userId, setUserId] = useState('');

  const course = courses.find((c) => c.id === courseId);
  const promoting = candidates.some((c) => c.id === userId);

  if (courses.length === 0) {
    return (
      <Empty>
        There are no courses to allot yet. Add one on the{' '}
        <Link to="/admin/courses" className="font-medium text-indigo-700 hover:underline">
          courses page
        </Link>{' '}
        first.
      </Empty>
    );
  }

  // Courses with nobody on them come first: they are what this screen is for.
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

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
              <optgroup label="Not allotted yet">
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
            trainers={trainers}
            candidates={candidates}
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="Choose who will run it…"
          />

          <Button type="submit" disabled={busy || !courseId || !userId}>
            {busy ? 'Allotting…' : 'Allot course'}
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          {!course && <>Pick a course to see who runs it today. </>}
          {course && course.trainer && (
            <>
              {course.code} is currently run by <strong>{course.trainer.fullName}</strong>.
              Allotting it moves the course and everything in it; candidates already enrolled stay
              enrolled.{' '}
            </>
          )}
          {course && !course.trainer && (
            <>{course.code} has nobody running it yet. </>
          )}
          {promoting && 'The person you have chosen is a candidate, and will be marked as a trainer.'}
        </p>
      </form>
    </Card>
  );
}

function AllotmentTable({ courses, trainers, candidates, busyId, onAdd, onRemove }) {
  if (courses.length === 0) return <Empty>No courses yet.</Empty>;

  return (
    <Table
      headers={[
        { label: 'Course' },
        { label: 'Lead' },
        { label: 'Team' },
        { label: 'Topics', align: 'right' },
        { label: 'Candidates', align: 'right' },
        { label: 'Status' },
      ]}
    >
      {courses.map((course) => (
        <Row key={course.id}>
          <Cell>
            <span className="block text-xs font-semibold tracking-wide text-indigo-600">
              {course.code}
            </span>
            <span className="font-medium text-slate-900">{course.title}</span>
          </Cell>
          <Cell>
            {course.trainer ? (
              <span className="text-slate-700">{course.trainer.fullName}</span>
            ) : (
              <Badge tone="amber">Not allotted</Badge>
            )}
          </Cell>
          <Cell>
            <TeamCell
              course={course}
              trainers={trainers}
              candidates={candidates}
              busy={busyId === `team-${course.id}`}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          </Cell>
          <Cell align="right" className="text-slate-700">
            {course.topics}
            {course.unassignedTopics > 0 && (
              <span className="ml-1 text-xs text-amber-700">
                ({course.unassignedTopics} unassigned)
              </span>
            )}
          </Cell>
          <Cell align="right" className="text-slate-700">
            {course.candidates}
            {course.pendingRequests > 0 && (
              <span className="ml-1 text-xs text-amber-700">
                (+{course.pendingRequests} waiting)
              </span>
            )}
          </Cell>
          <Cell>
            <Badge tone={course.isPublished ? 'green' : 'amber'}>
              {course.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </Cell>
        </Row>
      ))}
    </Table>
  );
}

/**
 * The trainers working under a course's lead. Adding someone who is still a
 * candidate marks them a trainer, exactly as allotting does.
 */
function TeamCell({ course, trainers, candidates, busy, onAdd, onRemove }) {
  const onTeam = new Set(course.team.map((m) => m.id));

  // The lead cannot also be on their own team, and nobody twice.
  const spare = (people) => people.filter((p) => !onTeam.has(p.id) && p.id !== course.trainer?.id);
  const spareTrainers = spare(trainers);
  const spareCandidates = spare(candidates);

  return (
    <div className="min-w-[15rem] space-y-2">
      {course.team.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {course.team.map((member) => (
            <span
              key={member.id}
              className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs font-medium ring-1 ${
                member.isActive
                  ? 'bg-slate-100 text-slate-700 ring-slate-200'
                  : 'bg-rose-50 text-rose-700 ring-rose-200'
              }`}
            >
              {member.fullName}
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemove(course, member)}
                title={`Take ${member.fullName} off this team`}
                className="rounded-full px-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!course.trainer ? (
        <p className="text-xs text-slate-400">Allot a lead first</p>
      ) : spareTrainers.length + spareCandidates.length === 0 ? (
        <p className="text-xs text-slate-400">Everyone is already on it</p>
      ) : (
        <select
          value=""
          disabled={busy}
          onChange={(event) => {
            const person = [...spareTrainers, ...spareCandidates].find(
              (p) => p.id === event.target.value,
            );
            if (person) onAdd(course, person);
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        >
          <option value="">{busy ? 'Saving…' : '+ Add a trainer'}</option>
          {spareTrainers.length > 0 && (
            <optgroup label="Trainers">
              {spareTrainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </optgroup>
          )}
          {spareCandidates.length > 0 && (
            <optgroup label="Candidates — will be marked as trainers">
              {spareCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </div>
  );
}

/**
 * The people a course can be handed to, in two groups: those already training,
 * and candidates who would be marked as trainers by the act of choosing them.
 */
function PersonSelect({ trainers, candidates, value, onChange, placeholder }) {
  return (
    <Select label="Trainer" required value={value} onChange={onChange}>
      <option value="" disabled>
        {placeholder}
      </option>
      {trainers.length > 0 && (
        <optgroup label="Trainers">
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.fullName} — {plural(t.courses, 'course')}
            </option>
          ))}
        </optgroup>
      )}
      {candidates.length > 0 && (
        <optgroup label="Candidates — will be marked as trainers">
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
