import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiUpload, openMaterial } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import QuizSection from './QuizSection';
import JoinRequests from './JoinRequests';
import CourseFeedbackPanel from './CourseFeedbackPanel';
import CompletionSummary from './CompletionSummary';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Textarea,
  formatBytes,
} from '../../components/ui';

export default function CourseDetail() {
  const { courseId } = useParams();

  const [course, setCourse] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load({ keepSelection = true } = {}) {
    try {
      const [{ course }, { candidates }] = await Promise.all([
        api(`/courses/${courseId}`),
        api('/allot/candidates'),
      ]);
      setCourse(course);
      setCandidates(candidates);
      setSelectedTopicId((current) =>
        keepSelection && current ? current : (course.topics[0]?.id ?? null),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load({ keepSelection: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  if (loading) return <p className="text-sm text-slate-500">Loading course…</p>;
  if (!course) return <Alert>{error ?? 'Course not found'}</Alert>;

  const selectedTopic = course.topics.find((t) => t.id === selectedTopicId) ?? null;

  return (
    <div>
      <Link to="/trainer" className="text-sm text-indigo-600 hover:text-indigo-700">
        ← All courses
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-x-10 gap-y-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-6">
        <div className="min-w-0">
          <CourseCode course={course} onChanged={load} onError={setError} />
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">{course.title}</h1>
            <Badge tone={course.isPublished ? 'green' : 'amber'}>
              {course.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </div>
          {course.description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {course.description}
            </p>
          )}
          <CourseDuration course={course} onChanged={load} onError={setError} />
        </div>
        <PublishToggle course={course} onChanged={load} onError={setError} />
      </div>

      <div className="mt-4">
        <Alert>{error}</Alert>
      </div>

      <div className="mt-8">
        <JoinRequests
          courseId={course.id}
          topicCount={course.topics.length}
          onChanged={load}
          onError={setError}
        />
      </div>

      <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
        <TopicSidebar
          course={course}
          selectedTopicId={selectedTopicId}
          onSelect={setSelectedTopicId}
          onChanged={load}
          onError={setError}
        />

        {selectedTopic ? (
          <TopicPanel
            key={selectedTopic.id}
            topic={selectedTopic}
            candidates={candidates}
            onChanged={load}
            onError={setError}
          />
        ) : (
          <Empty>Add your first topic to start building this course.</Empty>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <CompletionSummary
          courseId={course.id}
          durationWeeks={course.durationWeeks}
          onError={setError}
        />
        <CourseFeedbackPanel courseId={course.id} onError={setError} />
      </div>
    </div>
  );
}

/**
 * The course code. Admins can rename it in place; trainers see it read-only,
 * since the code identifies the course to everyone and is quoted outside the
 * system.
 */
function CourseCode({ course, onChanged, onError }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.code);
  const [busy, setBusy] = useState(false);

  if (user.role !== 'admin') {
    return <p className="text-base font-semibold tracking-wide text-indigo-600">{course.code}</p>;
  }

  async function save(event) {
    event.preventDefault();
    const code = value.trim().toUpperCase();

    if (code === course.code) return setEditing(false);

    setBusy(true);
    try {
      await api(`/courses/${course.id}`, { method: 'PATCH', body: { code } });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setValue(course.code);
          setEditing(true);
        }}
        title="Edit course code"
        className="group flex items-center gap-2 text-base font-semibold tracking-wide text-indigo-600 hover:text-indigo-700"
      >
        {course.code}
        <span className="text-xs font-normal text-slate-400 opacity-0 transition group-hover:opacity-100">
          edit
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={20}
        className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-base font-semibold uppercase tracking-wide outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
      <button type="submit" disabled={busy} className="text-sm text-indigo-600 hover:text-indigo-700">
        {busy ? '…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        Cancel
      </button>
    </form>
  );
}

/**
 * Expected length of the course, in weeks. Any trainer who owns the course can
 * set it; it tells candidates what they're committing to and flags anyone
 * running well over it.
 */
function CourseDuration({ course, onChanged, onError }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(course.durationWeeks ?? '');
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(`/courses/${course.id}`, {
        method: 'PATCH',
        // An empty box clears it rather than saving zero.
        body: { durationWeeks: value === '' ? null : Number(value) },
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="mt-3 flex items-center gap-2">
        <input
          autoFocus
          type="number"
          min={1}
          max={104}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 5"
          className="w-24 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        <span className="text-sm text-slate-600">weeks</span>
        <button type="submit" disabled={busy} className="text-sm text-indigo-600 hover:text-indigo-700">
          {busy ? '…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(course.durationWeeks ?? '');
            setEditing(false);
          }}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group mt-3 flex items-center gap-2 text-sm"
      title="Set the expected course duration"
    >
      {course.durationWeeks ? (
        <Badge tone="amber">Duration · {course.durationWeeks} weeks</Badge>
      ) : (
        <span className="text-slate-500">No duration set</span>
      )}
      <span className="text-xs text-slate-400 opacity-0 transition group-hover:opacity-100">
        edit
      </span>
    </button>
  );
}

/**
 * Publishing is what puts a course in the candidate-facing catalogue, so the
 * button says what actually changes rather than just "Publish".
 */
function PublishToggle({ course, onChanged, onError }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api(`/courses/${course.id}`, {
        method: 'PATCH',
        body: { isPublished: !course.isPublished },
      });
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-3">
      <Link to={`/trainer/courses/${course.id}/progress`}>
        <Button className="shadow-indigo-500/20">Candidate progress →</Button>
      </Link>
      {/* The status badge lives beside the course title; this is only the action. */}
      <p className="whitespace-nowrap text-xs text-slate-500">
        {course.isPublished ? 'Visible to candidates' : 'Hidden from candidates'}
      </p>
      <Button variant="secondary" onClick={toggle} disabled={busy}>
        {busy ? '…' : course.isPublished ? 'Unpublish' : 'Publish'}
      </Button>
    </div>
  );
}

// --------------------------------------------------------------- sidebar

function TopicSidebar({ course, selectedTopicId, onSelect, onChanged, onError }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', description: '' });
  const [saving, setSaving] = useState(false);

  async function handleAdd(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api(`/courses/${course.id}/topics`, { method: 'POST', body: form });
      setForm({ title: '', description: '' });
      setAdding(false);
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Course content ({course.topics.length})
        </h2>
        <button
          onClick={() => setAdding((open) => !open)}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          {adding ? 'Cancel' : '+ Topic'}
        </button>
      </div>

      {adding && (
        <Card className="mb-3 space-y-3 p-4">
          <form onSubmit={handleAdd} className="space-y-3">
            <Input
              label="Topic title"
              required
              autoFocus
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Textarea
              label="Description"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? 'Adding…' : 'Add topic'}
            </Button>
          </form>
        </Card>
      )}

      <nav className="space-y-2">
        {course.topics.map((topic) => {
          const active = topic.id === selectedTopicId;
          return (
            <button
              key={topic.id}
              onClick={() => onSelect(topic.id)}
              className={`w-full rounded-xl border-l-4 border-y border-r px-4 py-3.5 text-left transition ${
                active
                  ? 'border-l-indigo-500 border-y-indigo-200 border-r-indigo-200 bg-indigo-50/70 shadow-sm'
                  : 'border-l-slate-200 border-y-slate-200 border-r-slate-200 bg-white hover:border-l-indigo-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-baseline gap-2.5">
                <span className="text-xs text-slate-400">{topic.position}</span>
                <span className="text-sm font-medium leading-snug text-slate-900">
                  {topic.title}
                </span>
              </div>
              {/* Each figure wears the hue of the tab it belongs to. */}
              <p className="mt-1.5 flex flex-wrap gap-x-2 pl-6 text-xs">
                <span className="text-sky-700">
                  {topic.materials.length} file{topic.materials.length === 1 ? '' : 's'}
                </span>
                <span className="text-slate-300">·</span>
                <span className={topic.quiz ? 'text-violet-700' : 'text-slate-400'}>
                  {topic.quiz ? `${topic.quiz._count?.questions ?? 0} MCQ` : 'no quiz'}
                </span>
                <span className="text-slate-300">·</span>
                <span className={topic._count?.assignments ? 'text-emerald-700' : 'text-slate-400'}>
                  {topic._count?.assignments ?? 0} allotted
                </span>
              </p>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

// ----------------------------------------------------------------- panel

function TopicPanel({ topic, candidates, onChanged, onError }) {
  // A topic has three separate jobs — write it, test it, share it. Stacking all
  // three made the page long and buried allotment at the bottom.
  const [tab, setTab] = useState('material');

  // Each tab wears its section's hue, so the tab bar and the card beneath it
  // read as the same thing.
  const tabs = [
    {
      id: 'material',
      label: 'Material',
      count: topic.materials.length,
      active: 'border-sky-500 text-sky-700',
      chip: 'bg-sky-100 text-sky-700',
    },
    {
      id: 'quiz',
      label: 'Quiz',
      count: topic.quiz?._count?.questions ?? 0,
      active: 'border-violet-500 text-violet-700',
      chip: 'bg-violet-100 text-violet-700',
    },
    {
      id: 'access',
      label: 'Access',
      count: topic._count?.assignments ?? 0,
      active: 'border-emerald-500 text-emerald-700',
      chip: 'bg-emerald-100 text-emerald-700',
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{topic.title}</h2>
        {topic.description && (
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{topic.description}</p>
        )}
      </Card>

      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-5 py-3 text-sm transition ${
                active
                  ? `font-semibold ${item.active}`
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
              <span
                className={`rounded-full px-1.5 py-px text-xs font-medium ${
                  active ? item.chip : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {tab === 'material' && (
        <MaterialsSection topic={topic} onChanged={onChanged} onError={onError} />
      )}
      {tab === 'quiz' && <QuizSection topic={topic} onChanged={onChanged} onError={onError} />}
      {tab === 'access' && (
        <AllotmentSection
          topic={topic}
          candidates={candidates}
          onChanged={onChanged}
          onError={onError}
        />
      )}
    </div>
  );
}

function MaterialsSection({ topic, onChanged, onError }) {
  const fileInput = useRef(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(event) {
    event.preventDefault();
    if (!file) return;

    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      if (title.trim()) data.append('title', title.trim());

      await apiUpload(`/content/topics/${topic.id}/materials`, data);
      setTitle('');
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      await onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(materialId) {
    try {
      await api(`/content/materials/${materialId}`, { method: 'DELETE' });
      await onChanged();
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <Card accent="sky">
      <h3 className="text-lg font-semibold text-slate-900">Course material</h3>
      <p className="mt-1.5 text-sm text-slate-500">PDF, PPT or PPTX. Up to 50 MB per file.</p>

      <form onSubmit={handleUpload} className="mt-5 space-y-4 rounded-lg bg-slate-50 p-5">
        <Input
          label="Display title (optional)"
          placeholder="Defaults to the file name"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">File</span>
          <input
            ref={fileInput}
            type="file"
            required
            accept=".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-sky-700"
          />
        </div>
        <Button type="submit" disabled={!file || uploading}>
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </form>

      <div className="mt-5 space-y-2">
        {topic.materials.length === 0 ? (
          <Empty>No material uploaded for this topic yet.</Empty>
        ) : (
          topic.materials.map((material) => (
            <div
              key={material.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone="sky">{material.type === 'pdf' ? 'PDF' : 'Slides'}</Badge>
                  <span className="truncate text-sm font-medium text-slate-900">
                    {material.title}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {material.originalFilename} · {formatBytes(material.fileSizeBytes)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" onClick={() => openMaterial(material.id).catch((e) => onError(e.message))}>
                  Open
                </Button>
                <Button variant="danger" onClick={() => handleDelete(material.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function AllotmentSection({ topic, candidates, onChanged, onError }) {
  const [assigned, setAssigned] = useState([]);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);

  async function loadAssignments() {
    try {
      const { assignments } = await api(`/allot/topics/${topic.id}/assignments`);
      setAssigned(assignments);
    } catch (err) {
      onError(err.message);
    }
  }

  useEffect(() => {
    loadAssignments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.id]);

  const assignedIds = new Set(assigned.map((a) => a.user.id));
  const available = candidates.filter((c) => !assignedIds.has(c.id));

  async function handleAllot() {
    if (picked.length === 0) return;
    setBusy(true);
    try {
      await api(`/allot/topics/${topic.id}/assignments`, {
        method: 'POST',
        body: { candidateIds: picked },
      });
      setPicked([]);
      await Promise.all([loadAssignments(), onChanged()]);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId) {
    try {
      await api(`/allot/topics/${topic.id}/assignments/${userId}`, { method: 'DELETE' });
      await Promise.all([loadAssignments(), onChanged()]);
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <Card accent="emerald">
      <h3 className="text-lg font-semibold text-slate-900">Who can see this topic</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        Candidates see only the topics allotted to them — nothing else in the course.
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Has access ({assigned.length})
          </p>
          {assigned.length === 0 ? (
            <Empty>Not allotted to anyone yet.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {assigned.map(({ user }) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/40 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {user.fullName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">{user.email}</span>
                  </span>
                  <button
                    onClick={() => handleRemove(user.id)}
                    className="shrink-0 text-xs text-rose-600 underline hover:text-rose-700"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Available ({available.length})
            </p>
            {available.length > 1 && (
              <button
                onClick={() =>
                  setPicked(picked.length === available.length ? [] : available.map((c) => c.id))
                }
                className="text-xs text-indigo-600 hover:text-indigo-700"
              >
                {picked.length === available.length ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>

          {available.length === 0 ? (
            <Empty>Every candidate already has access.</Empty>
          ) : (
            <>
              <ul className="space-y-1">
                {available.map((candidate) => {
                  const checked = picked.includes(candidate.id);
                  return (
                    <li key={candidate.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition ${
                          checked
                            ? 'border-indigo-300 bg-indigo-50/60'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setPicked((current) =>
                              e.target.checked
                                ? [...current, candidate.id]
                                : current.filter((id) => id !== candidate.id),
                            )
                          }
                          className="shrink-0 rounded border-slate-300"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-slate-800">
                            {candidate.fullName}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {candidate.email}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <Button onClick={handleAllot} disabled={picked.length === 0 || busy} className="mt-3">
                {busy
                  ? 'Allotting…'
                  : picked.length === 0
                    ? 'Select candidates to allot'
                    : `Allot to ${picked.length}`}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
