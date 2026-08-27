import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, openProjectFile } from '../../lib/api';
import CourseNav from './CourseNav';
import { Alert, Button, Card, Empty, Input, Textarea } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// <input type="date"> wants yyyy-mm-dd, and gives it back the same way.
const asDateInput = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

/**
 * The practical work set on a course. The lead writes these; who does them is
 * the administrator's decision, so this page shows who holds each one but
 * cannot change it.
 */
export default function CourseProjects() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api(`/projects/courses/${courseId}`), api(`/courses/${courseId}`)])
        .then(([{ projects }, { course }]) => {
          setProjects(projects);
          setCourse(course);
        })
        .catch((err) => setError(err.message)),
    [courseId],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(request) {
    setBusy(true);
    setError(null);
    try {
      await request();
      await load();
      return true;
    } catch (err) {
      setError(err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const create = async (body) => {
    const made = await run(() => api(`/projects/courses/${courseId}`, { method: 'POST', body }));
    if (made) setAdding(false);
    return made;
  };

  const update = (project, body) =>
    run(() => api(`/projects/${project.id}`, { method: 'PATCH', body }));

  const remove = (project) =>
    run(() => api(`/projects/${project.id}`, { method: 'DELETE' }));

  if (!projects && !error) return <p className="text-sm text-slate-500">Loading projects…</p>;

  // Not canPublish — that admits admins, and writing the brief is the lead's
  // alone. An admin reads this page and hands the work out from Projects.
  const isLead = course?.viewer?.relation === 'lead';
  const isAdmin = course?.viewer?.relation === 'admin';

  const outstanding = (projects ?? []).filter((p) => p.completed < p.allotted).length;
  const unhanded = (projects ?? []).filter((p) => p.allotted === 0).length;
  const toReview = (projects ?? []).reduce((sum, p) => sum + p.awaitingReview, 0);

  return (
    // Held to a reading width. Full-bleed made a title box a thousand pixels
    // wide, which reads as a page that has not been laid out at all.
    <div className="max-w-4xl">
      <CourseNav courseId={courseId} work={course?.work} />

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-sm font-semibold tracking-wide text-indigo-600">
            {course?.code}
          </span>
          <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
          {projects?.length > 0 && (
            <span className="text-sm text-slate-500">
              {plural(projects.length, 'project')}
              {unhanded > 0 && <span className="text-amber-700"> · {unhanded} not given out</span>}
              {outstanding > 0 && unhanded === 0 && (
                <span className="text-slate-500"> · {outstanding} still running</span>
              )}
            </span>
          )}
        </div>

        {isLead && (
          <Button
            variant={adding ? 'secondary' : 'primary'}
            size="sm"
            onClick={() => setAdding((open) => !open)}
          >
            {adding ? 'Cancel' : 'New project'}
          </Button>
        )}
      </div>

      <p className="mt-3 max-w-2xl text-sm text-slate-500">
        {isLead
          ? 'Set the practical work for this course. An administrator decides who does each one.'
          : 'The practical work set on this course. Only its lead can change them.'}
      </p>

      <div className="mt-5 space-y-4">
        <Alert>{error}</Alert>

        {toReview > 0 && (
          <Alert tone="amber">
            {plural(toReview, 'submission')} waiting to be looked at —{' '}
            <Link
              to={`/trainer/courses/${courseId}/submissions`}
              className="font-medium underline"
            >
              {isLead ? 'evaluate the work' : 'see the work handed in'}
            </Link>
            .
          </Alert>
        )}

        {isAdmin && (
          <Alert tone="indigo">
            {course?.owner?.fullName ?? 'This course’s lead'} writes these briefs. Handing them to
            candidates is your half — do that from{' '}
            <Link to="/admin/projects" className="font-medium underline">
              Projects
            </Link>
            .
          </Alert>
        )}

        {adding && <ProjectForm busy={busy} onSave={create} onCancel={() => setAdding(false)} />}

        {projects?.length === 0 ? (
          <Empty>
            {isLead
              ? 'No projects yet. Add one and an administrator can hand it out.'
              : 'No projects have been set on this course yet.'}
          </Empty>
        ) : (
          projects?.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              isLead={isLead}
              busy={busy}
              onUpdate={update}
              onRemove={remove}
              onError={setError}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProjectRow({ project, isLead, busy, onUpdate, onRemove, onError }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ProjectForm
        project={project}
        busy={busy}
        onSave={async (body) => {
          const saved = await onUpdate(project, body);
          if (saved) setEditing(false);
          return saved;
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const everyone = project.allotted > 0 && project.completed === project.allotted;
  const done = project.allotted === 0 ? 0 : Math.round((project.completed / project.allotted) * 100);

  return (
    <Card flush>
      {/* A numbered rail: projects are an ordered set on the course, so the
          number is information rather than decoration. */}
      <div className="flex gap-4 px-5 py-4">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
          {project.position}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <h2 className="font-semibold text-slate-900">{project.title}</h2>

            <div className="flex shrink-0 items-center gap-2">
              {project.dueAt && (
                <span className="text-xs text-amber-700">Due {formatDate(project.dueAt)}</span>
              )}
              {isLead && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => setEditing(true)}
                    className="text-xs text-indigo-600 underline transition hover:text-indigo-700 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => onRemove(project)}
                    className="text-xs text-rose-600 underline transition hover:text-rose-700 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {project.brief && (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{project.brief}</p>
          )}
        </div>
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 pl-16">
        {project.allotted === 0 ? (
          <p className="text-xs text-amber-700">
            Not given to anyone yet — an administrator hands projects out.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs text-slate-600">
                <strong className={everyone ? 'text-emerald-700' : 'text-slate-900'}>
                  {project.completed} of {project.allotted}
                </strong>{' '}
                finished · {project.handedIn} handed work in
                {project.handedIn > 0 && ` · ${project.evaluated} evaluated`}
              </span>
              {/* A bar reads faster than the fraction when scanning a list. */}
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                <span
                  className={`block h-full rounded-full transition-[width] ${
                    everyone ? 'bg-emerald-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${done}%` }}
                />
              </span>
              {everyone && <span className="text-xs font-medium text-emerald-700">all done</span>}
            </div>

            {/* One row per candidate: where they are, and what they sent. */}
            <ul className="mt-2 divide-y divide-slate-200/70">
              {project.candidates.map((candidate) => (
                <li key={candidate.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
                  <span
                    className={`text-sm ${
                      candidate.completedAt ? 'text-emerald-700' : 'text-slate-700'
                    }`}
                  >
                    {candidate.completedAt && <span aria-hidden>✓ </span>}
                    {candidate.fullName}
                  </span>

                  <Work
                    projectId={project.id}
                    candidate={candidate}
                    onError={onError}
                  />

                  <Mark evaluation={candidate.evaluation} handedIn={candidate.submission.submittedAt} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * What one candidate handed in, beside their name. A link opens in a tab; a
 * file is fetched with the token and handed to the browser, since a plain href
 * cannot authenticate.
 */
function Work({ projectId, candidate, onError }) {
  const { submission } = candidate;

  if (!submission.submittedAt) {
    return <span className="text-xs text-slate-400">nothing handed in</span>;
  }

  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
      {submission.url && (
        <a
          href={submission.url}
          target="_blank"
          rel="noreferrer noopener"
          className="max-w-xs truncate text-indigo-600 underline hover:text-indigo-700"
          title={submission.url}
        >
          {submission.url.replace(/^https?:\/\//, '')}
        </a>
      )}

      {submission.filename && (
        <button
          onClick={() => openProjectFile(projectId, candidate.id).catch((e) => onError(e.message))}
          className="text-indigo-600 underline hover:text-indigo-700"
        >
          {submission.filename}
        </button>
      )}

      {submission.note && (
        <span className="max-w-md text-slate-500" title={submission.note}>
          “{submission.note.length > 80 ? `${submission.note.slice(0, 80)}…` : submission.note}”
        </span>
      )}
    </span>
  );
}

/**
 * Where the lead's judgement stands on one candidate's work, in the smallest
 * space that carries it. The detail — the feedback itself — lives on the Work
 * handed in screen; this list is for scanning.
 */
function Mark({ evaluation, handedIn }) {
  if (!evaluation.evaluatedAt) {
    // Nothing handed in and nothing marked is the ordinary state, not news.
    return handedIn ? <span className="text-xs text-amber-700">to review</span> : null;
  }

  return (
    <span
      className={`text-xs font-medium ${
        evaluation.score != null && evaluation.score < 50 ? 'text-rose-700' : 'text-emerald-700'
      }`}
      title={evaluation.feedback ?? undefined}
    >
      {evaluation.score == null ? 'reviewed' : `${evaluation.score}/100`}
    </span>
  );
}

/** One form for both adding and editing — the fields are the same either way. */
function ProjectForm({ project, busy, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: project?.title ?? '',
    brief: project?.brief ?? '',
    dueAt: asDateInput(project?.dueAt),
  });

  async function handleSubmit(event) {
    event.preventDefault();
    await onSave({
      title: form.title,
      brief: form.brief.trim() || undefined,
      // An empty box clears the deadline rather than sending a bad date.
      dueAt: form.dueAt || null,
    });
  }

  return (
    <Card accent="indigo" className="max-w-2xl">
      <h2 className="text-base font-semibold text-slate-900">
        {project ? 'Edit project' : 'New project'}
      </h2>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Input
          label="Title"
          placeholder="Draft a project charter"
          required
          autoFocus
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />

        <Textarea
          label="Brief"
          rows={5}
          placeholder="What the candidate has to produce, and what good looks like."
          value={form.brief}
          onChange={(event) => setForm({ ...form, brief: event.target.value })}
        />

        {/* A date box sized to a date, not stretched across the card. */}
        <div className="w-44">
          <Input
            label="Due date"
            type="date"
            value={form.dueAt}
            onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
          />
        </div>

        <div className="flex gap-2 border-t border-slate-100 pt-4">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Saving…' : project ? 'Save changes' : 'Add project'}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
