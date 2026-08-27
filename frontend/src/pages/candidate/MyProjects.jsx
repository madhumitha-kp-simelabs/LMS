import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiUpload, openProjectFile } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Textarea,
  formatBytes,
  toneForScore,
} from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The practical work set for this candidate. Outstanding first — the page is
 * for what still needs doing — with finished ones kept below as a record.
 */
export default function MyProjects() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(
    () =>
      api('/learn/projects')
        .then(({ projects }) => setProjects(projects))
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function setDone(project, done) {
    setBusyId(project.id);
    setError(null);
    try {
      await api(`/learn/projects/${project.id}`, { method: 'PATCH', body: { done } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!projects && !error) return <p className="text-sm text-slate-500">Loading projects…</p>;

  const outstanding = (projects ?? []).filter((p) => !p.completedAt);
  const done = (projects ?? []).filter((p) => p.completedAt);

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">My projects</h1>
      <p className="mt-1 text-sm text-slate-500">
        Practical work set on your courses. Mark one finished when you have done it — your trainer
        sees the same list.
      </p>

      <div className="mt-6 space-y-4">
        <Alert>{error}</Alert>

        {projects?.length === 0 ? (
          <Empty>
            No projects yet. Your administrator hands these out as your courses go along.
          </Empty>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {outstanding.length === 0
                ? `All ${plural(done.length, 'project')} finished.`
                : `${plural(outstanding.length, 'project')} outstanding${
                    done.length > 0 ? ` · ${done.length} finished` : ''
                  }.`}
            </p>

            <div className="space-y-3">
              {outstanding.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  busy={busyId === project.id}
                  onSetDone={setDone}
                  onChanged={load}
                  onError={setError}
                />
              ))}
            </div>

            {done.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Finished
                </p>
                {done.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    busy={busyId === project.id}
                    onSetDone={setDone}
                    onChanged={load}
                    onError={setError}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What the candidate produced: a link, a file, or both, with a note. Shown
 * read-only once handed in, because most of the time you are checking what you
 * sent rather than changing it.
 */
function YourWork({ project, onChanged, onError }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    url: project.submission.url ?? '',
    note: project.submission.note ?? '',
  });
  const fileInput = useRef(null);

  const { submission } = project;
  const handedIn = Boolean(submission.submittedAt);

  async function run(request) {
    setBusy(true);
    try {
      await request();
      await onChanged();
      return true;
    } catch (err) {
      onError(err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    const saved = await run(() =>
      api(`/learn/projects/${project.id}/submission`, {
        method: 'PATCH',
        body: { url: form.url.trim(), note: form.note.trim() },
      }),
    );
    if (saved) setEditing(false);
  }

  async function attach(file) {
    if (!file) return;
    const data = new FormData();
    data.append('file', file);
    await run(() => apiUpload(`/learn/projects/${project.id}/file`, data));
    if (fileInput.current) fileInput.current.value = '';
  }

  if (!editing) {
    return (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your work</p>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-indigo-600 underline hover:text-indigo-700"
          >
            {handedIn ? 'Change what you sent' : 'Add your work'}
          </button>
        </div>

        {!handedIn ? (
          <p className="mt-1 text-sm text-slate-500">
            Nothing handed in yet — add a link to your repo or deployed app, or attach a file.
          </p>
        ) : (
          <div className="mt-2 space-y-1.5 text-sm">
            {submission.url && (
              <p className="truncate">
                <a
                  href={submission.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-indigo-600 underline hover:text-indigo-700"
                >
                  {submission.url}
                </a>
              </p>
            )}
            {submission.filename && (
              <p className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    openProjectFile(project.id, user.id).catch((err) => onError(err.message))
                  }
                  className="text-indigo-600 underline hover:text-indigo-700"
                >
                  {submission.filename}
                </button>
                <span className="text-xs text-slate-500">
                  {formatBytes(Number(submission.fileSizeBytes))}
                </span>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() => api(`/learn/projects/${project.id}/file`, { method: 'DELETE' }))
                  }
                  className="text-xs text-rose-600 underline hover:text-rose-700 disabled:opacity-50"
                >
                  remove
                </button>
              </p>
            )}
            {submission.note && (
              <p className="text-sm leading-relaxed text-slate-600">{submission.note}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your work</p>

      <Input
        label="Link"
        type="url"
        placeholder="https://github.com/you/your-project"
        value={form.url}
        onChange={(event) => setForm({ ...form, url: event.target.value })}
      />

      <Textarea
        label="Anything your trainer should know"
        rows={3}
        value={form.note}
        onChange={(event) => setForm({ ...form, note: event.target.value })}
      />

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-700">
          File {submission.filename ? '(replaces the one attached)' : '(optional)'}
        </span>
        <input
          ref={fileInput}
          type="file"
          disabled={busy}
          onChange={(event) => attach(event.target.files?.[0])}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => setEditing(false)}
        >
          Done editing
        </Button>
      </div>
    </form>
  );
}

/**
 * What the course lead said about the work. Only ever shown once they have
 * said something: an empty "not yet evaluated" panel on every project would be
 * a page of nothing, and the candidate cannot act on it either way.
 */
function Feedback({ evaluation }) {
  if (!evaluation?.evaluatedAt) return null;

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
          Trainer’s evaluation
        </p>
        {evaluation.score != null && (
          <Badge tone={toneForScore(evaluation.score)}>{evaluation.score}/100</Badge>
        )}
      </div>

      {evaluation.feedback && (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{evaluation.feedback}</p>
      )}

      <p className="mt-1.5 text-xs text-slate-500">
        {evaluation.evaluatedBy?.fullName ?? 'Your course lead'} ·{' '}
        {formatDate(evaluation.evaluatedAt)}
      </p>
    </div>
  );
}

function ProjectCard({ project, busy, onSetDone, onChanged, onError }) {
  const finished = Boolean(project.completedAt);

  return (
    <Card accent={finished ? 'emerald' : project.overdue ? 'rose' : 'indigo'}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-indigo-600">
              {project.course.code}
            </span>
            {project.overdue && <Badge tone="rose">Overdue</Badge>}
            {finished && <Badge tone="green">Done {formatDate(project.completedAt)}</Badge>}
            {project.evaluation?.evaluatedAt && project.evaluation.score != null && (
              <Badge tone={toneForScore(project.evaluation.score)}>
                Scored {project.evaluation.score}/100
              </Badge>
            )}
          </div>

          <h2 className={`mt-1 font-semibold ${finished ? 'text-slate-500' : 'text-slate-900'}`}>
            {project.title}
          </h2>

          {project.brief && (
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">
              {project.brief}
            </p>
          )}

          <p className="mt-2 flex flex-wrap gap-x-2 text-xs text-slate-500">
            <span>{project.course.title}</span>
            <span className="text-slate-300">·</span>
            <span>Given {formatDate(project.allottedAt)}</span>
            {project.dueAt && (
              <>
                <span className="text-slate-300">·</span>
                <span className={project.overdue ? 'font-medium text-rose-700' : ''}>
                  Due {formatDate(project.dueAt)}
                </span>
              </>
            )}
          </p>

          <YourWork project={project} onChanged={onChanged} onError={onError} />

          <Feedback evaluation={project.evaluation} />
        </div>

        <Button
          variant={finished ? 'secondary' : 'primary'}
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={() => onSetDone(project, !finished)}
        >
          {busy ? 'Saving…' : finished ? 'Not done after all' : 'Mark done'}
        </Button>
      </div>
    </Card>
  );
}
