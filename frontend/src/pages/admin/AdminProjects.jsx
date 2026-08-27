import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { Alert, Badge, Card, Empty, Select } from '../../components/ui';

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Handing out the practical work. Leads write the briefs on their own courses;
 * this page is the other half — who actually does each one.
 *
 * A project goes to as many candidates as you like, and each of them finishes
 * it in their own time, so the list under a project mixes both states.
 */
export default function AdminProjects() {
  const [projects, setProjects] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(
    () =>
      Promise.all([api('/admin/projects'), api('/admin/overview')])
        .then(([{ projects }, overview]) => {
          setProjects(projects);
          // Leads come from their own list rather than being folded into
          // `candidates`, which the Administration tables read and which should
          // go on meaning "people whose only job here is learning". Anyone who
          // cannot take this particular project — because they run the course —
          // is refused by the API, not hidden from the picker.
          setCandidates(
            [...overview.candidates, ...overview.leads]
              .filter((c) => c.isActive)
              .sort((a, b) => a.fullName.localeCompare(b.fullName)),
          );
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function run(id, request, done) {
    setBusyId(id);
    setNotice(null);
    try {
      await request();
      await load();
      setNotice({ tone: 'indigo', text: done });
    } catch (err) {
      setNotice({
        tone: 'rose',
        text: err.details?.length ? err.details.map((d) => d.message).join(' · ') : err.message,
      });
    } finally {
      setBusyId(null);
    }
  }

  const give = (project, candidate) =>
    run(
      project.id,
      () =>
        api(`/admin/projects/${project.id}/allotments`, {
          method: 'POST',
          body: { candidateIds: [candidate.id] },
        }),
      `${candidate.fullName} has “${project.title}”.`,
    );

  const takeBack = (project, candidate) =>
    run(
      project.id,
      () => api(`/admin/projects/${project.id}/allotments/${candidate.id}`, { method: 'DELETE' }),
      `Took “${project.title}” back from ${candidate.fullName}.`,
    );

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

  if (!projects) return <p className="text-sm text-slate-500">Loading projects…</p>;

  // One block per course, in the order the API returns them (by course code).
  const byCourse = [];
  for (const project of projects) {
    const last = byCourse[byCourse.length - 1];
    if (last && last.course.id === project.course.id) last.projects.push(project);
    else byCourse.push({ course: project.course, projects: [project] });
  }

  const unallotted = projects.filter((p) => p.allotted === 0).length;

  return (
    <div>
      <Heading />

      <div className="mt-8 space-y-6">
        {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}

        {projects.length === 0 ? (
          <Empty>
            No projects have been written yet. Each course’s lead adds them from their own course
            page, and they appear here to hand out.
          </Empty>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              {plural(projects.length, 'project')} across {plural(byCourse.length, 'course')}
              {unallotted > 0 && (
                <span className="font-medium text-amber-700">
                  {' '}
                  · {unallotted} not given to anyone yet
                </span>
              )}
            </p>

            {byCourse.map(({ course, projects: list }) => (
              <section key={course.id}>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-xs font-semibold tracking-wide text-indigo-600">
                    {course.code}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900">{course.title}</h2>
                  {!course.isPublished && <Badge tone="amber">Draft course</Badge>}
                </div>

                <div className="mt-3 space-y-3">
                  {list.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      candidates={candidates}
                      busy={busyId === project.id}
                      onGive={give}
                      onTakeBack={takeBack}
                    />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const Heading = () => (
  <div>
    <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
    <p className="mt-1 text-sm text-slate-500">
      Give each project to the candidates who should do it. One project can go to as many people as
      you like; each of them marks their own copy finished.
    </p>
  </div>
);

function ProjectCard({ project, candidates, busy, onGive, onTakeBack }) {
  const holding = new Set(project.candidates.map((c) => c.id));
  const spare = candidates.filter((c) => !holding.has(c.id));

  return (
    <Card flush accent={project.allotted === 0 ? 'amber' : 'indigo'}>
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{project.title}</h3>
            {project.dueAt && <Badge tone="amber">Due {formatDate(project.dueAt)}</Badge>}
            {project.allotted === 0 && <Badge tone="rose">Not given out</Badge>}
          </div>
          {project.brief && (
            <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-slate-600">{project.brief}</p>
          )}
        </div>

        {project.allotted > 0 && (
          <p className="shrink-0 text-xs text-slate-500">
            {project.completed} of {project.allotted} finished
          </p>
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
        {project.candidates.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {project.candidates.map((candidate) => (
              <span
                key={candidate.id}
                title={
                  candidate.completedAt
                    ? `Finished ${formatDate(candidate.completedAt)}`
                    : `Given ${formatDate(candidate.allottedAt)}`
                }
                className={`inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1 text-xs font-medium ring-1 ${
                  candidate.completedAt
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    : 'bg-white text-slate-700 ring-slate-300'
                }`}
              >
                {candidate.fullName}
                {candidate.completedAt && <span aria-hidden>✓</span>}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onTakeBack(project, candidate)}
                  title={`Take this project back from ${candidate.fullName}`}
                  className="grid h-4 w-4 place-items-center rounded-full text-slate-400 transition hover:bg-slate-200 hover:text-slate-800 disabled:opacity-40"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        {spare.length === 0 ? (
          <p className="text-xs text-slate-500">Every candidate already has this one.</p>
        ) : (
          <div className="max-w-sm">
            <Select
              value=""
              disabled={busy}
              onChange={(event) => {
                const candidate = spare.find((c) => c.id === event.target.value);
                if (candidate) onGive(project, candidate);
              }}
            >
              <option value="" disabled>
                {busy ? 'Saving…' : '+ Give it to a candidate'}
              </option>
              {spare.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.fullName}
                  {/* An <option> holds text and nothing else, so the lead
                      marker is spelled out rather than badged. */}
                  {candidate.role === 'lead' ? ' — course lead' : ''}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </Card>
  );
}
